"""Regras de domínio compartilhadas pelo painel e pela automação.

Fuso, dinheiro e telefone precisam de uma única definição: painel e automação
escrevem na mesma tabela, e duas interpretações do mesmo dado produzem agenda
deslocada, centavo perdido ou cliente duplicado.
"""

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Union

# Fuso de negócio. O Brasil não usa horário de verão desde 2019, então o offset
# fixo é exato hoje. Não é `zoneinfo` porque o Windows não traz base de fusos e
# `tzdata` seria uma dependência nova só para reproduzir -03:00. O cálculo de
# disponibilidade que realmente depende de regra de fuso acontece no banco, em
# `fn_buscar_slots`, com `at time zone 'America/Sao_Paulo'`.
FUSO_NEGOCIO = "America/Sao_Paulo"
SAO_PAULO_TZ = timezone(timedelta(hours=-3))

CENTAVO = Decimal("0.01")


# ===== FUSO =====
def com_fuso_de_negocio(valor: datetime) -> datetime:
    """Resolve horário sem offset como local de São Paulo, nunca como UTC.

    Tratar ingenuamente como UTC deslocava o agendamento em três horas — e em
    silêncio, porque o resultado continua sendo uma data válida.
    """
    if valor.tzinfo is None:
        return valor.replace(tzinfo=SAO_PAULO_TZ)
    return valor


def montar_intervalo(inicio: datetime, duracao_minutos: int) -> str:
    """Literal `tstzrange` fechado-aberto a partir de início e duração."""
    if duracao_minutos <= 0:
        raise ValueError("duracao_minutos precisa ser positivo")
    comeco = com_fuso_de_negocio(inicio).astimezone(SAO_PAULO_TZ)
    fim = comeco + timedelta(minutes=duracao_minutos)
    return f'["{comeco.isoformat()}","{fim.isoformat()}")'


_INTERVALO = re.compile(r'^[\[\(]\s*"?([^",]+)"?\s*,\s*"?([^",]+)"?\s*[\]\)]$')


def ler_intervalo(texto: str) -> Optional[tuple]:
    """Converte o literal `tstzrange` devolvido pelo PostgREST em duas datas.

    Devolve ``None`` quando o texto não é um intervalo com as duas pontas: o
    chamador decide se isso é erro de infraestrutura ou linha a ignorar.
    """
    encontrado = _INTERVALO.match((texto or "").strip())
    if not encontrado:
        return None
    try:
        comeco = datetime.fromisoformat(encontrado.group(1).strip())
        fim = datetime.fromisoformat(encontrado.group(2).strip())
    except ValueError:
        return None
    return com_fuso_de_negocio(comeco), com_fuso_de_negocio(fim)


def agora() -> datetime:
    return datetime.now(SAO_PAULO_TZ)


def iso_no_fuso_de_negocio(valor: Union[datetime, str, None]) -> Optional[str]:
    """Data de resposta sempre em -03:00.

    O PostgREST devolve `timestamptz` no fuso da conexão, normalmente UTC.
    Entregar isso à automação obrigaria cada nó a converter antes de falar com
    o cliente — e um esquecimento vira horário errado na mensagem.
    """
    if valor is None:
        return None
    if isinstance(valor, str):
        try:
            valor = datetime.fromisoformat(valor)
        except ValueError:
            return None
    return com_fuso_de_negocio(valor).astimezone(SAO_PAULO_TZ).isoformat()


# ===== DINHEIRO =====
def dinheiro(valor: Union[Decimal, int, float, str, None]) -> Optional[Decimal]:
    """Normaliza qualquer entrada monetária em `Decimal` com dois dígitos.

    `float` entra por conversão via texto: `Decimal(0.1)` guardaria o erro
    binário do float, `Decimal(str(0.1))` não.
    """
    if valor is None:
        return None
    try:
        bruto = valor if isinstance(valor, Decimal) else Decimal(str(valor))
    except (InvalidOperation, ValueError):
        return None
    return bruto.quantize(CENTAVO)


def dinheiro_para_banco(valor: Union[Decimal, int, float, str, None]) -> Optional[str]:
    """Texto para o corpo JSON do PostgREST.

    `Decimal` não é serializável em JSON e `float` reintroduz erro de
    arredondamento; o PostgreSQL converte o texto para `numeric` sem perda.
    """
    convertido = dinheiro(valor)
    return None if convertido is None else format(convertido, "f")


def dinheiro_para_json(valor: Union[Decimal, int, float, str, None]) -> Optional[float]:
    """Número JSON para a resposta HTTP.

    O contrato com o painel e com a automação já é numérico; a exatidão que
    importa é a do cálculo e a da gravação, que acontecem em `Decimal`.
    """
    convertido = dinheiro(valor)
    return None if convertido is None else float(convertido)


# ===== TELEFONE =====
_SO_DIGITOS = re.compile(r"\D")


def _digitos(bruto: Optional[str]) -> str:
    return _SO_DIGITOS.sub("", bruto or "")


def normalizar_telefone(bruto: Optional[str]) -> Optional[str]:
    """Forma canônica brasileira: `55` + DDD + número, só dígitos.

    Aceita JID do WhatsApp ("5551999990000@s.whatsapp.net"), número formatado
    do painel ("(51) 99999-0000") e discagem internacional ("+55 51 ...").
    Devolve ``None`` quando não dá para reconhecer um telefone brasileiro —
    inventar um número é pior que recusar a operação.
    """
    numero = _digitos(bruto)
    if numero.startswith("00"):
        numero = numero[2:]

    if len(numero) in (12, 13) and numero.startswith("55"):
        local = numero[2:]
    elif len(numero) in (10, 11):
        local = numero
    else:
        return None

    if not local[:2].isdigit() or int(local[:2]) < 11:
        return None
    return "55" + local


def telefones_equivalentes(bruto: Optional[str]) -> List[str]:
    """Formas do mesmo contato que podem estar gravadas em `cliente.whats`.

    O painel grava o número como a pessoa digitou; o WhatsApp entrega o JID. E
    números antigos circulam com e sem o nono dígito. Consultar só a forma
    canônica criaria um segundo cadastro para quem já existe — exatamente o que
    o índice único por empresa impede, com erro em vez de resultado.

    A canônica vem primeiro: quando mais de uma forma existir no banco, ela é a
    escolhida.
    """
    canonico = normalizar_telefone(bruto)
    if not canonico:
        return []

    local = canonico[2:]
    locais = [local]
    # ponytail: heurística do nono dígito, não uma base de numeração. Cobre o
    # caso real (celular com e sem o 9 na mesma empresa); número fora desse
    # padrão continua sendo tratado só pela forma canônica.
    if len(local) == 11 and local[2] == "9":
        locais.append(local[:2] + local[3:])
    elif len(local) == 10 and local[2] in "6789":
        locais.append(local[:2] + "9" + local[2:])

    formas: List[str] = []
    for candidato in locais:
        for forma in ("55" + candidato, candidato):
            if forma not in formas:
                formas.append(forma)
    return formas


_CONTROLE = re.compile(r"[\x00-\x1f\x7f]")


def texto_seguro(bruto: Optional[str], limite: int) -> Optional[str]:
    """Higieniza texto vindo de fora antes de gravar.

    Nome de perfil do WhatsApp é conteúdo do usuário: pode trazer caractere de
    controle e quebra de linha, que sujam a tela do painel e o prompt do fluxo.
    """
    if bruto is None:
        return None
    limpo = _CONTROLE.sub(" ", bruto)
    limpo = " ".join(limpo.split())[:limite].strip()
    return limpo or None
