-- INSERT para disponibilidade de profissionais
-- Ajuste os horários conforme a necessidade da sua clínica

-- Exemplo 1: Profissional disponível de segunda a sexta (8h às 18h)
INSERT INTO disponibilidade_profissional (dia_semana, hora_inicio, hora_fim, id_profissional) VALUES
(1, '08:00:00', '18:00:00', 1), -- Segunda-feira
(2, '08:00:00', '18:00:00', 1), -- Terça-feira
(3, '08:00:00', '18:00:00', 1), -- Quarta-feira
(4, '08:00:00', '18:00:00', 1), -- Quinta-feira
(5, '08:00:00', '18:00:00', 1); -- Sexta-feira

-- Exemplo 2: Profissional disponível de segunda a sexta (9h às 17h) com intervalo
INSERT INTO disponibilidade_profissional (dia_semana, hora_inicio, hora_fim, id_profissional) VALUES
(1, '09:00:00', '12:00:00', 2), -- Segunda-feira (manhã)
(1, '14:00:00', '17:00:00', 2), -- Segunda-feira (tarde)
(2, '09:00:00', '12:00:00', 2), -- Terça-feira (manhã)
(2, '14:00:00', '17:00:00', 2), -- Terça-feira (tarde)
(3, '09:00:00', '12:00:00', 2), -- Quarta-feira (manhã)
(3, '14:00:00', '17:00:00', 2), -- Quarta-feira (tarde)
(4, '09:00:00', '12:00:00', 2), -- Quinta-feira (manhã)
(4, '14:00:00', '17:00:00', 2), -- Quinta-feira (tarde)
(5, '09:00:00', '12:00:00', 2), -- Sexta-feira (manhã)
(5, '14:00:00', '17:00:00', 2); -- Sexta-feira (tarde)

-- Exemplo 3: Profissional disponível apenas alguns dias
INSERT INTO disponibilidade_profissional (dia_semana, hora_inicio, hora_fim, id_profissional) VALUES
(2, '14:00:00', '20:00:00', 3), -- Terça-feira
(4, '14:00:00', '20:00:00', 3), -- Quinta-feira
(6, '08:00:00', '12:00:00', 3); -- Sábado

-- Exemplo 4: Profissional com horários variados por dia
INSERT INTO disponibilidade_profissional (dia_semana, hora_inicio, hora_fim, id_profissional) VALUES
(1, '07:00:00', '13:00:00', 4), -- Segunda-feira
(2, '13:00:00', '19:00:00', 4), -- Terça-feira
(3, '07:00:00', '13:00:00', 4), -- Quarta-feira
(4, '13:00:00', '19:00:00', 4), -- Quinta-feira
(5, '07:00:00', '13:00:00', 4); -- Sexta-feira

-- Notas:
-- - dia_semana: 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado, 7=Domingo
-- - id_profissional: Substitua pelo ID real do profissional
-- - Use o formato HH:MM:SS para as horas
-- - Para horários com intervalo de almoço, crie dois registros para o mesmo dia
