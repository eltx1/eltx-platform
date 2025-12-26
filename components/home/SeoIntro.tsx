import { dict, useLang } from '../../app/lib/i18n';

export default function SeoIntro() {
  const { lang } = useLang();
  const content = dict[lang].home.seoIntro;

  return (
    <section className="bg-neutral-950 border-t border-b border-white/5 py-14 px-4">
      <div className="max-w-6xl mx-auto grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-300/80">{content.kicker}</p>
          <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">{content.title}</h2>
          <p className="text-base md:text-lg text-white/80 leading-relaxed">{content.description}</p>
          <p className="text-base md:text-lg text-white/70 leading-relaxed">{content.secondary}</p>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="rounded-2xl border border-purple-500/20 bg-white/5 p-4 space-y-2">
              <p className="font-semibold">{content.highlights.title}</p>
              <ul className="list-disc list-inside text-white/80 space-y-1">
                {content.highlights.items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-cyan-500/20 bg-white/5 p-4 space-y-2">
              <p className="font-semibold">{content.trust.title}</p>
              <ul className="list-disc list-inside text-white/80 space-y-1">
                {content.trust.items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-600/10 via-fuchsia-500/10 to-cyan-500/10 p-6 shadow-lg shadow-purple-900/20 space-y-4">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">{content.why.title}</h3>
            <p className="text-white/80 text-sm leading-relaxed">{content.why.copy}</p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-lg">{content.keywords.title}</h4>
            <p className="text-white/75 text-sm leading-relaxed">{content.keywords.list}</p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-lg">{content.value.title}</h4>
            <ul className="list-disc list-inside text-white/80 space-y-1 text-sm">
              {content.value.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
