import React from 'react';
import { Card } from '../components/ui/card';

const Configuracoes = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>Configurações</h1>
        <p className="mt-2 text-base" style={{ color: '#292726' }}>Gerencie as configurações</p>
      </div>
      <Card className="p-12 rounded-2xl shadow-lg text-center" style={{ backgroundColor: 'white' }}>
        <p style={{ color: '#292726' }}>Módulo de configurações em desenvolvimento</p>
      </Card>
    </div>
  );
};
export default Configuracoes;