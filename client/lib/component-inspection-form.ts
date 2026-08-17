export const SUPPORTED_ASSIGNMENT_COMPONENTS = [
  "Grid Extension",
  "Mini Grid",
  "SAS",
] as const;

export type SupportedAssignmentComponent =
  (typeof SUPPORTED_ASSIGNMENT_COMPONENTS)[number];

export type ComponentFormValues = Record<string, string>;

export type ComponentFieldDefinition = {
  key: string;
  label: string;
  kind?: "text" | "integer" | "decimal" | "coordinate" | "phone" | "select";
  assignmentKey?:
    | "programme"
    | "contractor"
    | "state"
    | "lga"
    | "id"
    | "projectName"
    | "community"
    | "latitude"
    | "longitude";
  options?: string[];
};

export type ComponentFormItem =
  | (ComponentFieldDefinition & { type: "field" })
  | {
      type: "group";
      label: string;
      fields: ComponentFieldDefinition[];
    };

export type ComponentFormSection = {
  title: string;
  items: ComponentFormItem[];
};

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const statusOptions = ["Not Started", "Ongoing", "Completed"];
const dateFields = (prefix: string): ComponentFieldDefinition[] => [
  { key: `${prefix}Year`, label: "Year", kind: "integer" },
  { key: `${prefix}Month`, label: "Month", kind: "select", options: months },
];
const publicInstitutionFields: ComponentFieldDefinition[] = [
  { key: "publicInstitutionHospitals", label: "Hospitals", kind: "integer" },
  { key: "publicInstitutionSchools", label: "Schools", kind: "integer" },
  {
    key: "publicInstitutionPublicFacilities",
    label: "Public Facilities",
    kind: "integer",
  },
];

const commonProjectFields: ComponentFormItem[] = [
  {
    type: "field",
    key: "programName",
    label: "Program Name",
    assignmentKey: "programme",
  },
  {
    type: "field",
    key: "organizationName",
    label: "Organization Name",
    assignmentKey: "contractor",
  },
  { type: "field", key: "state", label: "State", assignmentKey: "state" },
  { type: "field", key: "lga", label: "LGA", assignmentKey: "lga" },
  {
    type: "field",
    key: "identifierCode",
    label: "Identifier/ Code",
    assignmentKey: "id",
  },
];

export const COMPONENT_FORM_SECTIONS: Record<
  SupportedAssignmentComponent,
  ComponentFormSection[]
> = {
  "Grid Extension": [
    {
      title: "Project and location information",
      items: [
        ...commonProjectFields,
        {
          type: "field",
          key: "projectName",
          label: "Project Name",
          assignmentKey: "projectName",
        },
        {
          type: "field",
          key: "projectCommunity",
          label: "Project Community",
          assignmentKey: "community",
        },
        {
          type: "field",
          key: "latitude",
          label: "Latitude",
          kind: "coordinate",
          assignmentKey: "latitude",
        },
        {
          type: "field",
          key: "longitude",
          label: "Longitude",
          kind: "coordinate",
          assignmentKey: "longitude",
        },
      ],
    },
    {
      title: "Implementation status and dates",
      items: [
        {
          type: "field",
          key: "status",
          label: "Status",
          kind: "select",
          options: statusOptions,
        },
        { type: "group", label: "Start Date", fields: dateFields("startDate") },
        {
          type: "group",
          label: "Date of Completion",
          fields: dateFields("completionDate"),
        },
      ],
    },
    {
      title: "Technical",
      items: [
        {
          type: "field",
          key: "communitiesElectrifiedByGridExtension",
          label: "Number of Communities electrified by grid extension",
          kind: "integer",
        },
        {
          type: "group",
          label: "Number of Transformers (KVA)",
          fields: ["200", "300", "500", "7500", "15000"].map((rating) => ({
            key: `transformersKva${rating}`,
            label: rating,
            kind: "integer" as const,
          })),
        },
        {
          type: "field",
          key: "totalTransformerCapacityKva",
          label: "Total Transformer Capacity(KVA)",
          kind: "decimal",
        },
        {
          type: "field",
          key: "kmOfNetworkBuilt",
          label: "KM of network built",
          kind: "decimal",
        },
        {
          type: "field",
          key: "numberOfPoles",
          label: "Number of poles",
          kind: "integer",
        },
      ],
    },
    {
      title: "Financial",
      items: [
        {
          type: "group",
          label: "Total Project Cost",
          fields: [
            { key: "totalProjectCostNaira", label: "₦", kind: "decimal" },
          ],
        },
      ],
    },
    {
      title: "Public institutions",
      items: [
        {
          type: "group",
          label: "Public Institution Electrified",
          fields: publicInstitutionFields,
        },
      ],
    },
  ],
  "Mini Grid": [
    {
      title: "Project and location information",
      items: [
        ...commonProjectFields,
        {
          type: "field",
          key: "projectName",
          label: "Project Name",
          assignmentKey: "projectName",
        },
        {
          type: "field",
          key: "typeOfMiniGrid",
          label: "Type of Mini-Grid",
          kind: "select",
          options: ["Isolated", "Interconnected"],
        },
        {
          type: "field",
          key: "projectCommunity",
          label: "Project Community",
          assignmentKey: "community",
        },
        {
          type: "field",
          key: "latitude",
          label: "Latitude",
          kind: "coordinate",
          assignmentKey: "latitude",
        },
        {
          type: "field",
          key: "longtitude",
          label: "Longtitude",
          kind: "coordinate",
          assignmentKey: "longitude",
        },
      ],
    },
    {
      title: "Connections and implementation status",
      items: [
        {
          type: "field",
          key: "totalNumberOfConnections",
          label: "Total Number of Connections",
          kind: "integer",
        },
        {
          type: "field",
          key: "residentialConnections",
          label: "Residential Connections",
          kind: "integer",
        },
        {
          type: "field",
          key: "commercialPueConnections",
          label: "Commercial / PUE Connections",
          kind: "integer",
        },
        { type: "field", key: "tariff", label: "Tariff", kind: "decimal" },
        {
          type: "field",
          key: "status",
          label: "Status",
          kind: "select",
          options: statusOptions,
        },
        { type: "group", label: "Start Date", fields: dateFields("startDate") },
        {
          type: "group",
          label: "Date of Completion",
          fields: dateFields("completionDate"),
        },
      ],
    },
    {
      title: "Financial",
      items: [
        {
          type: "group",
          label: "Total Project Cost",
          fields: [
            { key: "totalProjectCostDollar", label: "$", kind: "decimal" },
            { key: "totalProjectCostNaira", label: "₦", kind: "decimal" },
          ],
        },
        {
          type: "field",
          key: "grantPerConnection",
          label: "Grant per Connection",
          kind: "decimal",
        },
      ],
    },
    {
      title: "Technical",
      items: [
        {
          type: "field",
          key: "numberOfMiniGrid",
          label: "Number of Mini-grid",
          kind: "integer",
        },
        {
          type: "group",
          label: "System Capacity",
          fields: [
            {
              key: "installedPvKwp",
              label: "Installed PV (kWp)",
              kind: "decimal",
            },
            {
              key: "inverterCapacityKw",
              label: "Inverter Capacity (kW)",
              kind: "decimal",
            },
            {
              key: "batteryCapacityKwh",
              label: "Battery Capacity (kWh)",
              kind: "decimal",
            },
          ],
        },
      ],
    },
    {
      title: "Public institutions",
      items: [
        {
          type: "group",
          label: "Public Institution Electrified",
          fields: publicInstitutionFields,
        },
      ],
    },
  ],
  SAS: [
    {
      title: "Program, customer and location information",
      items: [
        ...commonProjectFields,
        { type: "field", key: "customerName", label: "Customer Name" },
        {
          type: "field",
          key: "genderOfCustomer",
          label: "Gender of Customer",
          kind: "select",
          options: ["Female", "Male", "Prefer not to say"],
        },
        {
          type: "field",
          key: "customerPhoneNumber",
          label: "Customer Phone Number",
          kind: "phone",
        },
      ],
    },
    {
      title: "Connection and implementation status",
      items: [
        {
          type: "field",
          key: "status",
          label: "Status",
          kind: "select",
          options: statusOptions,
        },
        {
          type: "field",
          key: "typeOfConnection",
          label: "Type of Connection",
          kind: "select",
          options: ["Residential", "Commercial / PUE", "Public Institution"],
        },
        { type: "group", label: "Start Date", fields: dateFields("startDate") },
        {
          type: "group",
          label: "Date of Completion",
          fields: dateFields("completionDate"),
        },
      ],
    },
    {
      title: "Financial",
      items: [
        {
          type: "group",
          label: "Total Project Cost",
          fields: [
            { key: "totalProjectCostNaira", label: "₦", kind: "decimal" },
          ],
        },
        {
          type: "field",
          key: "grantPerConnection",
          label: "Grant per Connection",
          kind: "decimal",
        },
      ],
    },
    {
      title: "Technical",
      items: [
        {
          type: "field",
          key: "numberOfSasUnits",
          label: "Number of SAS Units",
          kind: "integer",
        },
        {
          type: "group",
          label: "System Capacity",
          fields: [
            {
              key: "installedPvKwp",
              label: "Installed PV (kWp)",
              kind: "decimal",
            },
            {
              key: "batteryCapacityH",
              label: "Battery Capacity ( h)",
              kind: "decimal",
            },
          ],
        },
      ],
    },
  ],
};

export function isSupportedAssignmentComponent(
  component: string,
): component is SupportedAssignmentComponent {
  return SUPPORTED_ASSIGNMENT_COMPONENTS.includes(
    component as SupportedAssignmentComponent,
  );
}

export function normalizeAssignmentComponent(component: string) {
  return component === "Solar Home System" ? "SAS" : component;
}

export function getComponentFieldDefinitions(
  component: SupportedAssignmentComponent,
) {
  return COMPONENT_FORM_SECTIONS[component].flatMap((section) =>
    section.items.flatMap((item) =>
      item.type === "group" ? item.fields : [item],
    ),
  );
}

export function createComponentFormValues(
  component: SupportedAssignmentComponent,
  assignment: Record<string, unknown>,
): ComponentFormValues {
  return Object.fromEntries(
    getComponentFieldDefinitions(component).map((field) => {
      const value = field.assignmentKey ? assignment[field.assignmentKey] : "";
      return [field.key, value == null ? "" : String(value)];
    }),
  );
}

export function sanitizeComponentFormValues(
  component: SupportedAssignmentComponent,
  values: ComponentFormValues,
) {
  return Object.fromEntries(
    getComponentFieldDefinitions(component).map((field) => [
      field.key,
      String(values[field.key] ?? ""),
    ]),
  );
}

export function validateComponentFormValues(
  component: SupportedAssignmentComponent,
  values: ComponentFormValues,
) {
  return getComponentFieldDefinitions(component).every((field) => {
    const value = String(values[field.key] ?? "").trim();
    if (!value) return false;
    if (field.kind === "integer") {
      const number = Number(value);
      return Number.isInteger(number) && number >= 0;
    }
    if (field.kind === "decimal") {
      const number = Number(value);
      return Number.isFinite(number) && number >= 0;
    }
    if (field.kind === "coordinate") {
      const number = Number(value);
      if (!Number.isFinite(number)) return false;
      return field.label === "Latitude"
        ? number >= -90 && number <= 90
        : number >= -180 && number <= 180;
    }
    if (field.kind === "select") return Boolean(field.options?.includes(value));
    if (field.kind === "phone") return /^[0-9+() -]+$/.test(value);
    return true;
  });
}
