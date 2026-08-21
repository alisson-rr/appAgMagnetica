import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Percent } from 'lucide-react';
import { Card } from '../components/ui/card';
import { EmptyState, PageHeader } from '../components/PageChrome';

const Comissoes = () => {
  return (
    <div className="page-shell">
      <PageHeader title="Comissões" description="Repasse por profissional a partir dos atendimentos concluídos." />
      <Card>
        <EmptyState
          icon={Percent}
          title="Módulo em construção"
          description="As comissões ainda não estão disponíveis. Enquanto isso, os valores por atendimento ficam em Financeiro."
        >
          <Link to="/pagamentos" className="btn-brand">
            Ir para Financeiro <ArrowRight size={16} />
          </Link>
        </EmptyState>
      </Card>
    </div>
  );
};
export default Comissoes;