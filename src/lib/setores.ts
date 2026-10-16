// PNCP contratações carry no CNAE, so "sector" is a keyword preset the user can edit.
export const SETORES: { id: string; nome: string; cnae: string; palavras: string }[] = [
  { id: "ti", nome: "Informática e TI", cnae: "47.51, 62.01, 62.04", palavras: "computador, notebook, software, licença de software, impressora, servidor de rede, suporte técnico de informática" },
  { id: "limpeza", nome: "Limpeza e conservação", cnae: "81.21, 46.49", palavras: "material de limpeza, serviço de limpeza, higienização, saneantes, conservação predial" },
  { id: "alimentos", nome: "Alimentação", cnae: "46.39, 56.20", palavras: "gêneros alimentícios, merenda escolar, alimentação escolar, refeições, coffee break, hortifruti" },
  { id: "obras", nome: "Obras e reformas", cnae: "41.20, 43.30", palavras: "reforma, construção, pavimentação, manutenção predial, obra de engenharia" },
  { id: "saude", nome: "Material hospitalar", cnae: "46.45, 47.73", palavras: "material hospitalar, medicamentos, equipamento médico, insumos odontológicos, EPI" },
  { id: "escritorio", nome: "Papelaria e escritório", cnae: "47.61, 46.47", palavras: "material de expediente, papelaria, papel A4, mobiliário de escritório, toner" },
  { id: "veiculos", nome: "Veículos e peças", cnae: "45.30, 45.20", palavras: "peças automotivas, pneus, manutenção de veículos, combustível, locação de veículos" },
  { id: "eventos", nome: "Eventos e gráfica", cnae: "18.13, 82.30", palavras: "serviços gráficos, impressão, banners, sonorização, organização de eventos, tendas" },
];

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB",
  "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];
