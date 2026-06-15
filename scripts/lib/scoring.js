export function formatHours(hours) {
  const numericHours = Number(hours);

  if (!Number.isFinite(numericHours)) {
    return String(hours);
  }

  return numericHours.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export function scoreFromHours(hours) {
  const numericHours = Number(hours);

  if (!Number.isFinite(numericHours)) return 1;
  if (numericHours <= 0.5) return 10;
  if (numericHours <= 1) return 9;
  if (numericHours <= 1.5) return 8;
  if (numericHours <= 2) return 7;
  if (numericHours <= 3) return 6;
  if (numericHours <= 4) return 5;
  if (numericHours <= 5.5) return 4;
  if (numericHours <= 7) return 3;
  if (numericHours <= 10) return 2;
  return 1;
}

export function scoreLabelFromScore(score) {
  if (score >= 9) return 'Easy';
  if (score >= 7) return 'DIY Friendly';
  if (score >= 5) return 'Moderate';
  if (score >= 3) return 'Advanced';
  return 'Major Job';
}

export function vehicleScoreLabelFromScore(score) {
  if (score >= 8) return 'Easy to Wrench';
  if (score >= 6.5) return 'DIY Friendly';
  if (score >= 5) return 'Moderate';
  if (score >= 3) return 'Advanced';
  return 'Major Project';
}

export function buildRepairExplanation(hours) {
  return `Estimated labor time: ${formatHours(hours)} hours.`;
}

export function buildVehicleVerdict() {
  return 'This score is based on common repair labor times and how approachable the vehicle is for typical maintenance and repair work.';
}
