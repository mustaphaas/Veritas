export type Project = {
  name: string;
  state: string;
  programme: string;
  component: string;
  contractor: string;
  month: string;
  status: string;
  tone: string;
  kw: number;
  households: number;
  verified: boolean;
  latitude?: number;
  longitude?: number;
  x: number;
  y: number;
};

export type StateSummary = {
  state: string;
  projects: number;
  programmes: number;
  components: string[];
  byComponent: Array<{ name: string; value: number }>;
  kw: number;
  households: number;
  verified: number;
  pending: number;
};

export const stateProjectTargets = {
  Abia: 8,
  Adamawa: 11,
  "Akwa Ibom": 9,
  Anambra: 14,
  Bauchi: 13,
  Bayelsa: 5,
  Benue: 12,
  Borno: 10,
  "Cross River": 9,
  Delta: 15,
  Ebonyi: 7,
  Edo: 13,
  Ekiti: 6,
  Enugu: 11,
  FCT: 8,
  Gombe: 10,
  Imo: 9,
  Jigawa: 12,
  Kaduna: 16,
  Kano: 20,
  Katsina: 15,
  Kebbi: 8,
  Kogi: 9,
  Kwara: 10,
  Lagos: 18,
  Nasarawa: 11,
  Niger: 14,
  Ogun: 15,
  Ondo: 8,
  Osun: 9,
  Oyo: 14,
  Plateau: 12,
  Rivers: 16,
  Sokoto: 11,
  Taraba: 7,
  Yobe: 8,
  Zamfara: 9,
} as const;

const programmes = ["NEP", "DARES", "AMP", "Others"];
const components = [
  "Mini Grid",
  "Solar Home System",
  "Grid Extension",
  "Solar Street Light",
];
const contractors = [
  "SunVolt Nigeria",
  "NorthGrid EPC",
  "Apex Power Works",
  "GreenTech Ltd",
];
const months = [
  "January 2024",
  "February 2024",
  "March 2024",
  "April 2024",
  "May 2024",
  "June 2024",
  "July 2024",
  "August 2024",
  "September 2024",
  "October 2024",
  "November 2024",
  "December 2024",
];
const statuses = [
  { status: "Verified", tone: "verified", verified: true },
  { status: "Verified", tone: "verified", verified: true },
  { status: "Verified", tone: "verified", verified: true },
  { status: "Submitted", tone: "submitted", verified: false },
  { status: "Pending", tone: "pending", verified: false },
  { status: "In progress", tone: "progress", verified: false },
] as const;

export const projects: Project[] = Object.entries(stateProjectTargets).flatMap(
  ([state, count], stateIndex) =>
    Array.from({ length: count }, (_, projectIndex) => {
      const seed = stateIndex * 37 + projectIndex * 11;
      const firstStateProject = projectIndex === 0;
      const status = statuses[seed % statuses.length];
      const component = firstStateProject
        ? "Mini Grid"
        : components[
            (seed + projectIndex * 2 + stateIndex) % components.length
          ];
      return {
        name: `${state} ${component} Project ${String(projectIndex + 1).padStart(2, "0")}`,
        state,
        programme: firstStateProject
          ? "NEP"
          : programmes[(seed + projectIndex * 2) % programmes.length],
        component,
        contractor: firstStateProject
          ? "SunVolt Nigeria"
          : contractors[(seed + stateIndex) % contractors.length],
        month: firstStateProject
          ? "June 2024"
          : months[(seed + projectIndex * 6) % months.length],
        status: status.status,
        tone: status.tone,
        kw: 120 + ((seed * 173 + projectIndex * 61) % 880),
        households: 80 + ((seed * 211 + projectIndex * 97) % 1420),
        verified: status.verified,
        x: 0,
        y: 0,
      };
    }),
);

export const filterDefaults = {
  programs: "All Programmes",
  components: "All Components",
  states: "All States",
  contractors: "All Contractors",
  months: "All Months",
} as const;
export type FilterKey = keyof typeof filterDefaults;
export type Filters = Record<FilterKey, string>;
export const defaultFilters: Filters = { ...filterDefaults };
export const filterLabels: Record<FilterKey, string> = {
  programs: "Programme",
  components: "Component",
  states: "State",
  contractors: "Contractor",
  months: "Month",
};

export function matchingProjects(filters: Filters, ignore?: FilterKey) {
  return projects.filter(
    (project) =>
      (ignore === "programs" ||
        filters.programs === filterDefaults.programs ||
        project.programme === filters.programs) &&
      (ignore === "components" ||
        filters.components === filterDefaults.components ||
        project.component === filters.components) &&
      (ignore === "states" ||
        filters.states === filterDefaults.states ||
        project.state === filters.states) &&
      (ignore === "contractors" ||
        filters.contractors === filterDefaults.contractors ||
        project.contractor === filters.contractors) &&
      (ignore === "months" ||
        filters.months === filterDefaults.months ||
        project.month === filters.months),
  );
}

export function getFilterOptions(filters: Filters, key: FilterKey) {
  const values = [
    ...new Set(
      matchingProjects(filters, key).map((project) =>
        key === "programs"
          ? project.programme
          : key === "components"
            ? project.component
            : key === "states"
              ? project.state
              : key === "contractors"
                ? project.contractor
                : project.month,
      ),
    ),
  ];
  return [filterDefaults[key], ...values];
}

export function summarizeProjectsByState(
  filteredProjects: Project[],
): StateSummary[] {
  return [...new Set(filteredProjects.map((project) => project.state))].map(
    (state) => {
      const stateProjects = filteredProjects.filter(
        (project) => project.state === state,
      );
      const components = [
        ...new Set(stateProjects.map((project) => project.component)),
      ];
      return {
        state,
        projects: stateProjects.length,
        programmes: new Set(stateProjects.map((project) => project.programme))
          .size,
        components,
        byComponent: components.map((component) => ({
          name: component,
          value: stateProjects.filter(
            (project) => project.component === component,
          ).length,
        })),
        kw: stateProjects.reduce((sum, project) => sum + project.kw, 0),
        households: stateProjects.reduce(
          (sum, project) => sum + project.households,
          0,
        ),
        verified: stateProjects.filter((project) => project.verified).length,
        pending: stateProjects.filter((project) => !project.verified).length,
      };
    },
  );
}

export function summarizePortfolio(filteredProjects: Project[]) {
  const verified = filteredProjects.filter(
    (project) => project.verified,
  ).length;
  return {
    projects: filteredProjects.length,
    kw: filteredProjects.reduce((total, project) => total + project.kw, 0),
    households: filteredProjects.reduce(
      (total, project) => total + project.households,
      0,
    ),
    verified,
    pending: filteredProjects.length - verified,
    verificationRate: filteredProjects.length
      ? Math.round((verified / filteredProjects.length) * 100)
      : 0,
  };
}
