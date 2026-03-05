'use client';

/* eslint-disable react/no-unescaped-entities */

import type { ReactNode } from 'react';
import { dict, useLang } from '../lib/i18n';

export default function ChildSafetyPage() {
  const { lang } = useLang();
  const t = dict[lang];

  const content: Record<'en' | 'ar', ReactNode> = {
    en: (
      <>
        <p className="opacity-80 text-sm">Last updated: 03/05/2026</p>
        <p className="opacity-80 text-sm">
          LordAi.Net is committed to preventing, detecting, and reporting child sexual abuse and exploitation (CSAE) and all child
          endangerment content. This public page summarizes our platform standards and enforcement model in alignment with Google
          Play child safety requirements.
        </p>
        <ol className="list-decimal pl-4 space-y-4 text-sm opacity-80">
          <li className="space-y-1">
            <p className="font-medium">Zero tolerance policy</p>
            <p>
              We strictly prohibit child sexual abuse material (CSAM), grooming behavior, sexualization of minors, sextortion,
              trafficking, and any exploitative or predatory behavior involving children. Any detected violation triggers immediate
              enforcement.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Content moderation and detection</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Automated signals and trust & safety heuristics are used to identify high-risk content and behavior patterns.</li>
              <li>User reporting tools are available in-product to flag harmful content, accounts, or conversations.</li>
              <li>Escalated reports are reviewed by trained moderators with urgent-priority handling for child safety cases.</li>
            </ul>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Enforcement actions</p>
            <p>When violations are identified, we may apply one or more of the following actions without prior notice:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Immediate content removal and account suspension or permanent termination.</li>
              <li>Preservation of relevant logs and evidence in line with legal obligations.</li>
              <li>Restriction of related accounts and technical abuse vectors.</li>
            </ul>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Reporting to authorities</p>
            <p>
              Where legally required, and for credible CSAE incidents, we report to the appropriate authorities and cooperate with
              lawful requests. We maintain internal procedures for evidence handling, legal response, and emergency escalation.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">User safety and age protections</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Our services are not intended for users under 18.</li>
              <li>We may apply age-gating, account checks, and feature restrictions to reduce child safety risk.</li>
              <li>We encourage guardians and users to report concerns immediately through our dedicated contact channel.</li>
            </ul>
          </li>
          <li className="space-y-1">
            <p className="font-medium">How to report child safety concerns</p>
            <p>
              If you encounter suspicious behavior or content involving a child, contact us immediately at
              <span className="font-medium"> info.eltx@gmail.com</span> with relevant details (profile ID, message links,
              timestamps, and screenshots if available).
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Continuous improvement</p>
            <p>
              We continuously review policy language, detection mechanisms, and moderator workflows to keep pace with evolving
              threats and strengthen child safety controls across the platform.
            </p>
          </li>
        </ol>
      </>
    ),
    ar: (
      <>
        <p className="opacity-80 text-sm">آخر تحديث: 05/03/2026</p>
        <p className="opacity-80 text-sm">
          منصة LordAi.Net ملتزمة بمنع واكتشاف والإبلاغ عن أي محتوى متعلق بالاستغلال أو الإساءة الجنسية للأطفال (CSAE) وأي
          محتوى يعرّض الأطفال للخطر. الصفحة العامة دي بتوضح معايير المنصة وآليات التنفيذ بما يتماشى مع متطلبات Google Play
          الخاصة بسلامة الأطفال.
        </p>
        <ol className="list-decimal pl-4 space-y-4 text-sm opacity-80">
          <li className="space-y-1">
            <p className="font-medium">سياسة عدم التسامح مطلقًا</p>
            <p>
              بنمنع بشكل صارم أي مواد إساءة جنسية للأطفال (CSAM)، أو سلوك استدراج (grooming)، أو أي محتوى فيه طابع جنسي
              متعلق بقُصّر، أو ابتزاز جنسي، أو اتجار، أو أي سلوك استغلالي/افتراسي ضد الأطفال. أي مخالفة يتم اكتشافها بيتم
              التعامل معاها فورًا.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">المراجعة والرصد</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>نستخدم إشارات آلية وقواعد أمان لاكتشاف المحتوى أو الأنماط عالية الخطورة.</li>
              <li>نوفر أدوات إبلاغ داخل المنصة للإبلاغ عن المحتوى أو الحسابات أو المحادثات الضارة.</li>
              <li>البلاغات المصعّدة يراجعها فريق مختص مع أولوية عاجلة لحالات سلامة الأطفال.</li>
            </ul>
          </li>
          <li className="space-y-1">
            <p className="font-medium">إجراءات التنفيذ</p>
            <p>عند ثبوت المخالفة قد نطبق إجراء أو أكثر بدون إشعار مسبق:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>حذف المحتوى فورًا وإيقاف الحساب مؤقتًا أو نهائيًا.</li>
              <li>الاحتفاظ بالسجلات والأدلة ذات الصلة بما يتوافق مع الالتزامات القانونية.</li>
              <li>تقييد الحسابات المرتبطة ومسارات إساءة الاستخدام التقنية.</li>
            </ul>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الإبلاغ للجهات المختصة</p>
            <p>
              في الحالات التي يفرضها القانون، أو في وقائع CSAE الموثوقة، بنبلغ الجهات المختصة ونتعاون مع الطلبات القانونية
              الرسمية. وعندنا إجراءات داخلية للتعامل مع الأدلة والاستجابة القانونية والتصعيد العاجل.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">حماية المستخدمين والسن</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>الخدمات غير موجهة لمن هم أقل من 18 سنة.</li>
              <li>ممكن نستخدم آليات تحقق عمر وقيود ميزات لتقليل مخاطر سلامة الأطفال.</li>
              <li>بننصح أولياء الأمور والمستخدمين بالإبلاغ الفوري عبر قناة التواصل المخصصة.</li>
            </ul>
          </li>
          <li className="space-y-1">
            <p className="font-medium">طريقة الإبلاغ عن أي خطر على طفل</p>
            <p>
              لو شفت سلوك أو محتوى مشبوه متعلق بطفل، تواصل فورًا على
              <span className="font-medium"> info.eltx@gmail.com</span> مع التفاصيل المتاحة (معرف الحساب، روابط الرسائل،
              التوقيتات، ولقطات شاشة إن وجدت).
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">تحسين مستمر</p>
            <p>
              بنحدث السياسات وآليات الرصد وإجراءات فريق المراجعة بشكل مستمر لمواكبة المخاطر الجديدة وتعزيز ضوابط حماية
              الأطفال على المنصة.
            </p>
          </li>
        </ol>
      </>
    ),
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.childSafety}</h1>
      {content[lang]}
    </div>
  );
}
