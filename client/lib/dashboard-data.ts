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

export const projects: Project[] = [
  {
    name: "Kano Solar Mini-grid Programme",
    state: "Kano",
    programme: "NEP",
    component: "Mini Grid",
    contractor: "SunVolt Nigeria",
    month: "June 2024",
    status: "Verified",
    tone: "verified",
    kw: 3200,
    households: 4200,
    verified: true,
    x: 218,
    y: 107,
  },
  {
    name: "Kaduna Rural Energy Access",
    state: "Kaduna",
    programme: "DARES",
    component: "Solar Home System",
    contractor: "NorthGrid EPC",
    month: "June 2024",
    status: "Verified",
    tone: "verified",
    kw: 2800,
    households: 3600,
    verified: true,
    x: 293,
    y: 129,
  },
  {
    name: "Katsina Community Power",
    state: "Katsina",
    programme: "AMP",
    component: "Mini Grid",
    contractor: "Apex Power Works",
    month: "May 2024",
    status: "In progress",
    tone: "progress",
    kw: 2400,
    households: 3100,
    verified: false,
    x: 358,
    y: 113,
  },
  {
    name: "Abuja Solar Hub",
    state: "FCT",
    programme: "NEP",
    component: "Solar Street Light",
    contractor: "NorthGrid EPC",
    month: "June 2024",
    status: "Submitted",
    tone: "submitted",
    kw: 1800,
    households: 2500,
    verified: false,
    x: 421,
    y: 151,
  },
  {
    name: "Akpabuyo Grid Extension",
    state: "Cross River",
    programme: "AMP",
    component: "Solar Home System",
    contractor: "Apex Power Works",
    month: "April 2024",
    status: "Verified",
    tone: "verified",
    kw: 3900,
    households: 5200,
    verified: true,
    x: 250,
    y: 192,
  },
  {
    name: "Sokoto Solar Home Systems",
    state: "Sokoto",
    programme: "DARES",
    component: "Solar Home System",
    contractor: "SunVolt Nigeria",
    month: "March 2024",
    status: "Verified",
    tone: "verified",
    kw: 1700,
    households: 2100,
    verified: true,
    x: 376,
    y: 205,
  },
  {
    name: "Jigawa Mini-grid Expansion",
    state: "Jigawa",
    programme: "NEP",
    component: "Mini Grid",
    contractor: "SunVolt Nigeria",
    month: "May 2024",
    status: "Pending",
    tone: "pending",
    kw: 1500,
    households: 1900,
    verified: false,
    x: 325,
    y: 237,
  },
  {
    name: "Gombe Grid Extension",
    state: "Gombe",
    programme: "DARES",
    component: "Mini Grid",
    contractor: "NorthGrid EPC",
    month: "April 2024",
    status: "Verified",
    tone: "verified",
    kw: 1200,
    households: 1700,
    verified: true,
    x: 440,
    y: 190,
  },
];

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
