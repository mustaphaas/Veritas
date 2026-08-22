import { ExternalLink, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

const resourceLinks = [
  { label: "Rural Electrification Agency", href: "https://rea.gov.ng/" },
  { label: "Nigeria Electrification Project", href: "https://nep.rea.gov.ng/" },
  { label: "DARES Programme", href: "https://dares.rea.gov.ng/" },
  { label: "NERC Portal", href: "https://nerc.gov.ng/" },
];

export default function VeritasFooter() {
  return (
    <footer className="veritas-footer relative mt-10 overflow-hidden border-t border-[#cfe8d6] bg-[#eef9f1] text-[#405b4a]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-[#bfe4c9]/70 bg-white/35" />
        <div className="absolute right-24 top-10 h-24 w-24 rounded-full border border-[#cdebd5]/80" />
        <div className="absolute -bottom-20 left-[12%] h-48 w-48 rounded-full border border-[#c7e7cf]/70 bg-[#f8fcf9]/50" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#79bf8d] to-transparent" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1580px] gap-8 px-5 py-8 sm:px-7 lg:grid-cols-[1.2fr_.8fr_1fr] lg:gap-10 lg:px-8 xl:px-10">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#b9dbc3] bg-white/75 text-[#08733f] shadow-sm">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-[-0.02em] text-[#244734]">Veritas</p>
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.13em] text-[#587363]">
                REA Project &amp; Verification Intelligence
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-[11px] leading-5 text-[#5c7465]">
            National management intelligence for programme delivery, field inspections,
            verification performance and project monitoring across Rural Electrification
            Agency interventions.
          </p>
        </div>

        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#3f5d49]">
            Useful Links
          </h3>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
            {resourceLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="group flex min-w-0 items-center gap-2 text-[11px] font-medium text-[#587363] transition-colors hover:text-[#08733f]"
              >
                <span className="truncate lg:whitespace-normal">{link.label}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-45 transition-opacity group-hover:opacity-100" />
              </a>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#3f5d49]">
            Contact REA
          </h3>
          <div className="mt-4 space-y-3 text-[11px] text-[#587363]">
            <a href="tel:+23480020202020" className="flex items-start gap-3 transition-colors hover:text-[#08733f]">
              <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#08733f]" strokeWidth={1.6} />
              <span className="break-words">(+234) 800 202 02020</span>
            </a>
            <a href="mailto:nep@rea.gov.ng" className="flex items-start gap-3 transition-colors hover:text-[#08733f]">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#08733f]" strokeWidth={1.6} />
              <span className="break-all">nep@rea.gov.ng</span>
            </a>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#08733f]" strokeWidth={1.6} />
              <span className="max-w-md leading-5">
                The Centurion Building, 15th Street, Constitution Avenue,
                Central Business District, Abuja, Nigeria.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative border-t border-[#cfe4d5] bg-[#e4f4e9]/90">
        <div className="mx-auto flex w-full max-w-[1580px] flex-col gap-2 px-5 py-3.5 text-[9px] leading-4 text-[#5a7463] sm:px-7 md:flex-row md:flex-wrap md:items-center md:justify-between lg:px-8 xl:px-10">
          <p className="shrink-0">© 2026 Veritas · Rural Electrification Agency.</p>
          <p className="max-w-3xl text-left md:text-right">
            Internal management information · Validate AI-generated analysis before official use.
          </p>
        </div>
      </div>
    </footer>
  );
}
