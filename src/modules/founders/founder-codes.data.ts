export interface FounderCommuneCode {
  code: string;
  commune: string;
  region: string;
  maxUses: number;
}

const REGION = 'Región Metropolitana';
const DEFAULT_MAX = 50;

export const FOUNDER_COMMUNE_CODES: FounderCommuneCode[] = [
  { code: 'FUNDADORALH', commune: 'Alhué', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORBUIN', commune: 'Buin', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORCT', commune: 'Calera de Tango', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORCER', commune: 'Cerrillos', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORCN', commune: 'Cerro Navia', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORCOL', commune: 'Colina', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORCON', commune: 'Conchalí', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORCUR', commune: 'Curacaví', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORBOS', commune: 'El Bosque', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADOREM', commune: 'El Monte', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADOREC', commune: 'Estación Central', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORHUE', commune: 'Huechuraba', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORIND', commune: 'Independencia', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORIM', commune: 'Isla de Maipo', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORLAC', commune: 'La Cisterna', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORLF', commune: 'La Florida', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORLGR', commune: 'La Granja', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORLPI', commune: 'La Pintana', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORLRE', commune: 'La Reina', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORLAM', commune: 'Lampa', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORLCO', commune: 'Las Condes', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORLB', commune: 'Lo Barnechea', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORLE', commune: 'Lo Espejo', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORLP', commune: 'Lo Prado', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORMAC', commune: 'Macul', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORMAI', commune: 'Maipú', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORMP', commune: 'María Pinto', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORMEL', commune: 'Melipilla', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORNUN', commune: 'Ñuñoa', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORPH', commune: 'Padre Hurtado', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORPAI', commune: 'Paine', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORPEF', commune: 'Peñaflor', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORPEL', commune: 'Peñalolén', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORPIR', commune: 'Pirque', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORPRO', commune: 'Providencia', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORPUD', commune: 'Pudahuel', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORQUI', commune: 'Quilicura', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORQN', commune: 'Quinta Normal', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORREC', commune: 'Recoleta', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORREN', commune: 'Renca', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORSB', commune: 'San Bernardo', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORSJ', commune: 'San Joaquín', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORSJM', commune: 'San José de Maipo', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORSM', commune: 'San Miguel', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORSPD', commune: 'San Pedro', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORSR', commune: 'San Ramón', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORSTGO', commune: 'Santiago', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORTAL', commune: 'Talagante', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORTIL', commune: 'Tiltil', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORVIT', commune: 'Vitacura', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORPA', commune: 'Puente Alto', region: REGION, maxUses: DEFAULT_MAX },
  { code: 'FUNDADORRM', commune: 'Región Metropolitana', region: REGION, maxUses: 200 }
];

export function getFounderCodeMetadata(code: string) {
  return FOUNDER_COMMUNE_CODES.find((item) => item.code === code.toUpperCase());
}

