export const COMMON_OWNERSHIP_REPAIR_SLUGS = [
  'headlight-bulb',
  'water-pump',
  'alternator',
  'starter',
  'brake-pads-front',
  'brake-pads-rear',
  'battery',
  'spark-plugs',
  'ignition-coils-all',
  'thermostat',
  'radiator',
  'serpentine-belt',
  'serpentine-belt-tensioner',
  'headlight-assembly',
  'tail-light-bulb',
  'wheel-bearing-front',
  'strut-assembly-front',
  'lower-control-arm-front',
  'fuel-pump',
  'blower-motor',
]

export const COMMON_OWNERSHIP_REPAIR_COUNT = COMMON_OWNERSHIP_REPAIR_SLUGS.length

export const COMMON_OWNERSHIP_REPAIR_NAME_KEYWORDS = [
  { slug: 'headlight-bulb', keywords: ['headlight', 'bulb'] },
  { slug: 'water-pump', keywords: ['water pump'] },
  { slug: 'alternator', keywords: ['alternator'] },
  { slug: 'starter', keywords: ['starter'] },
  { slug: 'brake-pads-front', keywords: ['front', 'brake'] },
  { slug: 'brake-pads-rear', keywords: ['rear', 'brake'] },
  { slug: 'battery', keywords: ['battery'] },
  { slug: 'spark-plugs', keywords: ['spark plug'] },
  { slug: 'ignition-coils-all', keywords: ['ignition coil'] },
  { slug: 'thermostat', keywords: ['thermostat'] },
  { slug: 'radiator', keywords: ['radiator'] },
  { slug: 'serpentine-belt', keywords: ['serpentine belt'] },
  { slug: 'serpentine-belt-tensioner', keywords: ['belt tensioner'] },
  { slug: 'headlight-assembly', keywords: ['headlight', 'assembly'] },
  { slug: 'tail-light-bulb', keywords: ['tail light', 'bulb'] },
  { slug: 'wheel-bearing-front', keywords: ['front', 'wheel bearing'] },
  { slug: 'strut-assembly-front', keywords: ['front', 'strut'] },
  { slug: 'lower-control-arm-front', keywords: ['front', 'lower control arm'] },
  { slug: 'fuel-pump', keywords: ['fuel pump'] },
  { slug: 'blower-motor', keywords: ['blower motor'] },
]

export function isCommonOwnershipRepairSlug(slug) {
  return COMMON_OWNERSHIP_REPAIR_SLUGS.includes(String(slug ?? '').trim().toLowerCase())
}

export function getCommonRepairCoverage(commonRepairCount) {
  const count = Number(commonRepairCount)

  if (count >= 16) return 'Strong coverage'
  if (count >= 10) return 'Good coverage'
  if (count >= 5) return 'Limited coverage'
  return 'Early estimate'
}
