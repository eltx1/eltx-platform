'use client';

/* eslint-disable react/no-unescaped-entities */

import { dict, useLang } from '../lib/i18n';
import type { ReactNode } from 'react';

export default function TermsPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const content: Record<'en' | 'ar', ReactNode> = {
    en: (
      <>
        <p className="opacity-80 text-sm">Last updated: 10/9/2025</p>
        <p className="opacity-80 text-sm">
          Welcome to ELTX. By using our platform, apps, or services ("Services"), you agree to these Terms.
        </p>
        <ol className="list-decimal pl-4 space-y-4 text-sm opacity-80">
          <li className="space-y-1">
            <p className="font-medium">Definitions</p>
            <p>“ELTX”, “we”, “us”, “our”: EliteX Agency LTD (UK), operator of the Services.</p>
            <p>“User”, “you”, “your”: Any person or entity using the Services.</p>
            <p>“Assets”: Supported native coins and standard tokens on integrated networks.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Nature of the Service</p>
            <p>
              ELTX provides custodial digital-asset services. User deposits are auto-swept to platform vaults for operational
              security and accounting.
            </p>
            <p>
              We do not provide investment, legal, or tax advice, nor do we guarantee profits or price performance.
            </p>
            <p>Supported assets and networks may be added or removed for technical, legal, or risk reasons.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Eligibility & Account</p>
            <p>You must be at least 18 years old and not prohibited by applicable law.</p>
            <p>We may require identity verification (KYC) and compliance checks (AML/CTF).</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Fees & Taxes</p>
            <p>
              Network fees (gas) apply to on-chain transactions. We may also charge service fees, clearly shown before
              confirmation.
            </p>
            <p>You are responsible for any taxes arising from your activities.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Deposits, Sweeps, and Withdrawals</p>
            <p>
              Deposits: Each user receives a deposit address. After required network confirmations, your deposit is recorded
              and your balance is updated.
            </p>
            <p>
              Sweeping: We may move Assets from deposit addresses to platform vaults (hot/cold) without prior notice for
              security and operations.
            </p>
            <p>
              Withdrawals: Subject to risk checks, limits, available liquidity, and compliance; additional verification may be
              required.
            </p>
            <p>Irreversibility: Blockchain transactions are generally irreversible once broadcast.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Risks</p>
            <p>
              Using digital assets involves risks, including price volatility, network delays or failures, smart-contract
              vulnerabilities, protocol changes, and provider outages. You assume these risks.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Prohibited Use</p>
            <p>
              You agree not to use the Services for illegal activities (including money laundering, terrorist financing),
              infringement, fraud, exploits/hacking, evasion of controls/sanctions, or any activity that breaches these Terms.
              We may suspend or terminate access at our discretion.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Security</p>
            <p>
              We implement technical and organizational measures to protect the Services and Assets, but no system is 100%
              secure. You must protect your login credentials and follow our security guidance.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Service Changes & Availability</p>
            <p>
              We may modify, suspend, or discontinue parts of the Services. We will provide notices where practical. Continued
              use after updates constitutes acceptance of the updated Terms.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Intellectual Property</p>
            <p>
              All ELTX software, trademarks, and content are owned by or licensed to EliteX Agency LTD. You receive a limited,
              revocable, non-transferable license to use the Services as permitted by these Terms.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Disclaimer; Limitation of Liability</p>
            <p>
              The Services are provided “as is” and “as available.” To the maximum extent permitted by law, ELTX disclaims all
              warranties and is not liable for indirect, consequential, or incidental damages, or loss of profits. Our total
              aggregate liability will not exceed the fees you paid to ELTX during the last 3 months related to the event giving
              rise to liability.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Indemnification</p>
            <p>
              You agree to indemnify and hold ELTX harmless from claims, losses, liabilities, and expenses arising from your use
              of the Services or breach of these Terms.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Governing Law & Dispute Resolution</p>
            <p>
              These Terms are governed by the laws of UK. Disputes shall be resolved by courts located in London, unless
              mandatory law provides otherwise. Please contact us first for an amicable resolution: info.eltx@gmail.com.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Contact</p>
            <p>EliteX Agency LTD (UK)</p>
            <p>Support: info.eltx@gmail.com | Legal: info.eltx@gmail.com</p>
          </li>
        </ol>
      </>
    ),
    ar: (
      <>
        <p className="opacity-80 text-sm">آخر تحديث: 10/9/2025</p>
        <p className="opacity-80 text-sm">
          مرحبًا بك في ELTX. باستخدامك منصتنا أو تطبيقاتنا أو خدماتنا ("الخدمات")، فإنك توافق على هذه الشروط.
        </p>
        <ol className="list-decimal pl-4 space-y-4 text-sm opacity-80">
          <li className="space-y-1">
            <p className="font-medium">التعريفات</p>
            <p>"ELTX" أو "نحن": شركة EliteX Agency LTD (المملكة المتحدة) المشغِّلة للخدمات.</p>
            <p>"المستخدم" أو "أنت": أي شخص أو جهة تستخدم الخدمات.</p>
            <p>"الأصول": العملات الأصلية والتوكنات القياسية المدعومة على الشبكات المتكاملة.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">طبيعة الخدمة</p>
            <p>توفر ELTX خدمات حفظ للأصول الرقمية. يتم تحويل ودائع المستخدمين تلقائيًا إلى خزائن المنصة لأغراض الأمان والمحاسبة.</p>
            <p>نحن لا نقدم استشارات استثمارية أو قانونية أو ضريبية، ولا نضمن أرباحًا أو أداءً سعريًا.</p>
            <p>قد تتم إضافة أو إزالة الأصول والشبكات المدعومة لأسباب تقنية أو قانونية أو مرتبطة بالمخاطر.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الأهلية والحساب</p>
            <p>يجب أن يكون عمرك 18 عامًا على الأقل وألا تكون ممنوعًا بموجب القوانين المعمول بها.</p>
            <p>قد نطلب التحقق من الهوية (اعرف عميلك) وفحوصات الامتثال (مكافحة غسل الأموال وتمويل الإرهاب).</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الرسوم والضرائب</p>
            <p>تنطبق رسوم الشبكة (الغاز) على المعاملات على السلسلة. قد نفرض أيضًا رسوم خدمة تظهر بوضوح قبل التأكيد.</p>
            <p>أنت مسؤول عن أي ضرائب تنشأ عن أنشطتك.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الإيداعات والسحب والتحويلات</p>
            <p>الإيداعات: يحصل كل مستخدم على عنوان إيداع. بعد تأكيدات الشبكة المطلوبة، يتم تسجيل إيداعك وتحديث رصيدك.</p>
            <p>
              التحويلات الداخلية: قد ننقل الأصول من عناوين الإيداع إلى خزائن المنصة (ساخنة/باردة) دون إشعار مسبق لأغراض
              الأمان والتشغيل.
            </p>
            <p>السحب: يخضع لفحوصات المخاطر والحدود والسيولة المتاحة والامتثال؛ وقد نطلب تحققًا إضافيًا.</p>
            <p>عدم القابلية للرجوع: معاملات البلوكشين عادةً غير قابلة للإلغاء بعد بثها.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">المخاطر</p>
            <p>
              استخدام الأصول الرقمية ينطوي على مخاطر تشمل تقلبات الأسعار وتأخيرات أو أعطال الشبكة وثغرات العقود الذكية
              وتغييرات البروتوكول وانقطاعات المزود. أنت تتحمل هذه المخاطر.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الاستخدام المحظور</p>
            <p>
              توافق على عدم استخدام الخدمات في أنشطة غير قانونية (بما في ذلك غسل الأموال وتمويل الإرهاب)، أو التعدي، أو
              الاحتيال، أو الاستغلال/الاختراق، أو التحايل على الضوابط/العقوبات، أو أي نشاط ينتهك هذه الشروط. يجوز لنا
              تعليق أو إنهاء الوصول وفقًا لتقديرنا.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الأمان</p>
            <p>
              نطبق تدابير تقنية وتنظيمية لحماية الخدمات والأصول، لكن لا يوجد نظام آمن تمامًا. يجب عليك حماية بيانات
              الدخول واتباع إرشادات الأمان الخاصة بنا.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">تغييرات الخدمة وتوفرها</p>
            <p>
              قد نعدّل أو نعلق أو نوقف أجزاء من الخدمات. سنقدم إشعارات عندما يكون ذلك ممكنًا. استمرارك في الاستخدام بعد
              التحديثات يعد قبولًا للشروط المحدثة.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الملكية الفكرية</p>
            <p>
              جميع برمجيات ELTX وعلاماتها التجارية ومحتواها مملوكة أو مرخّصة لشركة EliteX Agency LTD. تحصل على ترخيص محدود
              قابل للإلغاء وغير قابل للنقل لاستخدام الخدمات وفقًا لهذه الشروط.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">إخلاء المسؤولية والحد من المسؤولية</p>
            <p>
              تُقدَّم الخدمات "كما هي" و"حسب توافرها". إلى الحد الأقصى الذي يسمح به القانون، تخلي ELTX مسؤوليتها عن جميع
              الضمانات ولا تتحمل مسؤولية الأضرار غير المباشرة أو التبعية أو العرضية أو خسارة الأرباح. لن تتجاوز
              مسؤوليتنا الإجمالية الرسوم التي دفعتها لـ ELTX خلال الأشهر الثلاثة الأخيرة المتعلقة بالحدث الذي نشأت عنه
              المسؤولية.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">التعويض</p>
            <p>
              توافق على تعويض ELTX وإبرائها من أي مطالبات أو خسائر أو التزامات أو نفقات ناتجة عن استخدامك للخدمات أو
              خرقك لهذه الشروط.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">القانون الحاكم وتسوية النزاعات</p>
            <p>
              تخضع هذه الشروط لقوانين المملكة المتحدة. تُحل النزاعات بواسطة المحاكم الموجودة في لندن ما لم ينص القانون
              الإلزامي على خلاف ذلك. يرجى الاتصال بنا أولاً لحل ودي: info.eltx@gmail.com.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الاتصال</p>
            <p>EliteX Agency LTD (المملكة المتحدة)</p>
            <p>الدعم: info.eltx@gmail.com | الشؤون القانونية: info.eltx@gmail.com</p>
          </li>
        </ol>
      </>
    ),
  } as const;
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.terms}</h1>
      {content[lang]}
    </div>
  );
}
