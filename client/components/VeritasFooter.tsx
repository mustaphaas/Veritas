import { ExternalLink, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

const resourceLinks = [
  { label: "Rural Electrification Agency", href: "https://rea.gov.ng/" },
  { label: "Nigeria Electrification Project", href: "https://nep.rea.gov.ng/" },
  { label: "DARES Programme", href: "https://dares.rea.gov.ng/" },
  { label: "NERC Portal", href: "https://nerc.gov.ng/" },
];

export default function VeritasFooter() {
  return (
    <footer className="veritas-footer mt-10 border-t border-[#d9e1db] bg-[#edf1ee] text-[#46544b]">
      <div className="h-[3px] bg-[#08733f]" />
      <div className="mx-auto grid max-w-[1580px] gap-10 px-5 py-9 sm:px-7 lg:grid-cols-[1.25fr_.8fr_1fr] lg:px-7">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#c8d5cc] bg-[#f8faf8] text-[#08733f]">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-[-0.02em] text-[#314139]">
                Veritas
              </p>
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.13em] text-[#6d7a72]">
                REA Project &amp; Verification Intelligence
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-[11px] leading-5 text-[#66736b]">
            National management intelligence for programme delivery, field
            inspections, verification performance and project monitoring across
            Rural Electrification Agency interventions.
          </p>
        </div>

        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#526158]">
            Useful Links
          </h3>
          <div className="mt-4 space-y-2.5">
            {resourceLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-2 text-[11px] font-medium text-[#657169] transition-colors hover:text-[#08733f]"
              >
                <span>{link.label}</span>
                <ExternalLink className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-100" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#526158]">
            Contact REA
          </h3>
          <div className="mt-4 space-y-3 text-[11px] text-[#657169]">
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

      <div className="border-t border-[#d1dad3] bg-[#e2e8e3]">
        <div className="mx-auto flex max-w-[1580px] flex-col gap-2 px-5 py-3.5 text-[9px] text-[#6d7771] sm:px-7 md:flex-row md:items-center md:justify-between lg:px-7">
          <p>© 2026 Veritas · Rural Electrification Agency.</p>
          <p>Internal management information · Validate AI-generated analysis before official use.</p>
        </div>
      </div>
    </footer>
  );
}
