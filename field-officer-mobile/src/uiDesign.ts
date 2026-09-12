export function greetingName(officerName: string) {
  const fullName = officerName.trim().replace(/\s+/g, " ");
  return `Good day, ${fullName}.`;
}

export const sectionKpiCardSpec = {
  borderRadius: 20,
  centered: true,
  iconDiameter: 40,
} as const;
