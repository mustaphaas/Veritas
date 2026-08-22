import { BadgeCheck, ExternalLink, Mail, MapPin, Phone } from "lucide-react";

const resourceLinks = [
  { label: "Rural Electrification Agency", href: "https://rea.gov.ng/" },
  { label: "Nigeria Electrification Project", href: "https://nep.rea.gov.ng/" },
  { label: "DARES Programme", href: "https://dares.rea.gov.ng/" },
  { label: "NERC", href: "https://nerc.gov.ng/" },
];

export default function VeritasFooter() {
  return (
    <footer className="veritas-footer mt-10 bg-[#073822] text-white">
      <div className="border-t-4 border-[#18a15b]" />
      <div className="mx-auto grid max-w-[1580px] gap-10 px-5 py-10 sm:px-7 lg:grid-cols-[1.35fr_.8fr_1fr] lg:px-7">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white text-[#08733f] shadow-sm">
              <BadgeCheck className="h-6 w-6" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xl font-semibold tracking-[-0.025em]">Veritas</p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#91dbaa]">
                REA Project & Verification Intelligence
              </p>
            </div>
          </div>
          <p className="mt-5 max-w-xl text-xs leading-6 text-white/70">
            A management intelligence platform for monitoring programme delivery,
            field inspections, verification performance and project evidence across
            Rural Electrification Agency interventions.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-[10px] font-medium text-white/75">
            <span className="h-2 w-2 rounded-full bg-[#42c879]" />
            Built for evidence-led programme oversight
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#91dbaa]">
            Official Resources
          </h3>
          <div className="mt-4 space-y-3">
            {resourceLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-2 text-xs font-medium text-white/75 transition-colors hover:text-white"
              >
                <span>{link.label}</span>
                <ExternalLink className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-100" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#91dbaa]">
            REA Contact
          </h3>
          <div className="mt-4 space-y-3 text-xs text-white/75">
            <a
              href="tel:+23480020202020"
              className="flex items-start gap-3 transition-colors hover:text-white"
            >
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#78d69a]" strokeWidth={1.7} />
              <span>(+234) 800 202 02020</span>
            </a>
            <a
              href="mailto:nep@rea.gov.ng"
              className="flex items-start gap-3 transition-colors hover:text-white"
            >
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#78d69a]" strokeWidth={1.7} />
              <span>nep@rea.gov.ng</span>
            </a>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#78d69a]" strokeWidth={1.7} />
              <span className="leading-5">
                The Centurion Building, 15th Street, Constitution Avenue,
                Central Business District, Abuja, Nigeria.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 bg-[#052b1a]">
        <div className="mx-auto flex max-w-[1580px] flex-col gap-2 px-5 py-4 text-[9px] text-white/55 sm:px-7 md:flex-row md:items-center md:justify-between lg:px-7">
          <p>© 2026 Veritas · Rural Electrification Agency monitoring platform.</p>
          <p>Internal management information · Validate AI-generated analysis before official use.</p>
        </div>
      </div>
    </footer>
  );
}
