import { ExternalLink, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

const resourceLinks = [
  { label: "Rural Electrification Agency", href: "https://rea.gov.ng/" },
  { label: "Nigeria Electrification Project", href: "https://nep.rea.gov.ng/" },
  { label: "DARES Programme", href: "https://dares.rea.gov.ng/" },
  { label: "NERC Portal", href: "https://nerc.gov.ng/" },
];

export default function VeritasFooter() {
  return (
    <footer className="veritas-footer mt-10 bg-[#e7e8e5] text-[#47524c]">
      <div className="h-0.5 bg-[#08733f]" />
      <div className="mx-auto grid max-w-[1580px] gap-9 px-5 py-9 sm:px-7 lg:grid-cols-[1.2fr_.8fr_1fr] lg:px-7">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#c7cec9] bg-[#f4f5f3] text-[#08733f]">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-[-0.02em] text-[#36433c]">
                Veritas
              </p>
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#69756e]">
                REA Project &amp; Verification Intelligence
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-[11px] leading-5 text-[#667169]">
            National management intelligence for programme delivery, field
            inspections, verification performance and project monitoring across
            Rural Electrification Agency interventions.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-[10px] font-medium text-[#59665e]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#08733f]" />
            Evidence-led monitoring for REA management
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#59665e]">
            Useful Links
          </h3>
          <div className="mt-4 space-y-2.5">
            {resourceLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-2 text-[11px] font-medium text-[#5d6962] transition-colors hover:text-[#08733f]"
              >
                <span>{link.label}</span>
                <ExternalLink className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-100" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#59665e]">
            Contact REA
          </h3>
          <div className="mt-4 space-y-3 text-[11px] text-[#5d6962]">
            <a
              href="tel:+23480020202020"
              className="flex items-start gap-3 transition-colors hover:text-[#08733f]"
            >
              <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#08733f]" strokeWidth={1.6} />
              <span>(+234) 800 202 02020</span>
            </a>
            <a
              href="mailto:nep@rea.gov.ng"
              className="flex items-start gap-3 transition-colors hover:text-[#08733f]"
            >
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#08733f]" strokeWidth={1.6} />
              <span>nep@rea.gov.ng</span>
            </a>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#08733f]" strokeWidth={1.6} />
              <span className="leading-5">
                The Centurion Building, 15th Street, Constitution Avenue,
                Central Business District, Abuja, Nigeria.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[#cbd0cc] bg-[#d9dbd8]">
        <div className="mx-auto flex max-w-[1580px] flex-col gap-2 px-5 py-3.5 text-[9px] text-[#68716c] sm:px-7 md:flex-row md:items-center md:justify-between lg:px-7">
          <p>© 2026 Veritas · Rural Electrification Agency.</p>
          <p>Internal management information · Validate AI-generated analysis before official use.</p>
        </div>
      </div>
    </footer>
  );
}
