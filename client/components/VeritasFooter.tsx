import { ArrowUpRight, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

const resourceLinks = [
  { label: "Rural Electrification Agency", shortLabel: "REA", href: "https://rea.gov.ng/" },
  { label: "Nigeria Electrification Project", shortLabel: "NEP", href: "https://nep.rea.gov.ng/" },
  { label: "DARES Programme", shortLabel: "DARES", href: "https://dares.rea.gov.ng/" },
  { label: "Nigerian Electricity Regulatory Commission", shortLabel: "NERC", href: "https://nerc.gov.ng/" },
];

export default function VeritasFooter() {
  return (
    <footer className="veritas-footer mt-6 border-t border-[#cfe3d5] bg-white text-[#405b4a] lg:ml-[72px]">
      <div className="mx-auto w-full max-w-[1580px] px-4 py-5 sm:px-7 lg:px-7">
        <div className="overflow-hidden rounded-2xl border border-[#c9dfd0] bg-[#f4faf6] shadow-[0_10px_30px_rgba(18,66,39,.07)]">
          <div className="grid gap-6 px-5 py-6 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1.2fr] lg:gap-8 lg:px-7">
            <section className="min-w-0">
              <div className="flex items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#08733f] text-white shadow-[0_8px_18px_rgba(8,115,63,.2)]"><ShieldCheck className="h-5 w-5" strokeWidth={1.8} /></div><div><p className="text-base font-bold tracking-tight text-[#173b2a]">Veritas</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#63806d]">REA Project Intelligence</p></div></div>
              <p className="mt-4 max-w-lg text-[11px] leading-5 text-[#607769]">One trusted national workspace for programme delivery, field inspections, verification assurance and evidence-led project monitoring.</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#c9e3d1] bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#08733f]"><span className="h-1.5 w-1.5 rounded-full bg-[#16a15a]" /> Secure management platform</div>
            </section>

            <section className="min-w-0">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#365542]">Official Resources</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">{resourceLinks.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noreferrer" title={link.label} className="group flex items-center justify-between rounded-lg border border-[#d8e7dc] bg-white px-3 py-2.5 text-[10px] font-bold text-[#506b5a] transition-colors hover:border-[#9dceb0] hover:bg-[#edf8f1] hover:text-[#08733f]"><span>{link.shortLabel}</span><ArrowUpRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100" /></a>)}</div>
            </section>

            <section className="min-w-0 md:col-span-2 lg:col-span-1">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#365542]">Contact REA</h3>
              <div className="mt-3 grid gap-2 text-[10px] text-[#587363] sm:grid-cols-2 lg:grid-cols-1">
                <a href="tel:+23480020202020" className="flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 hover:border-[#d8e7dc] hover:bg-white hover:text-[#08733f]"><Phone className="h-3.5 w-3.5 shrink-0 text-[#08733f]" /> (+234) 800 202 02020</a>
                <a href="mailto:nep@rea.gov.ng" className="flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 hover:border-[#d8e7dc] hover:bg-white hover:text-[#08733f]"><Mail className="h-3.5 w-3.5 shrink-0 text-[#08733f]" /> nep@rea.gov.ng</a>
                <div className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 sm:col-span-2 lg:col-span-1"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#08733f]" /><span className="leading-4">The Centurion Building, Constitution Avenue, Central Business District, Abuja.</span></div>
              </div>
            </section>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-[#cce1d3] bg-[#0b5935] px-5 py-3 text-[9px] text-white/75 sm:flex-row sm:items-center sm:justify-between lg:px-7"><p>© 2026 Veritas · Rural Electrification Agency</p><p>Internal management information · Validate AI-generated analysis before official use.</p></div>
        </div>
      </div>
    </footer>
  );
}
