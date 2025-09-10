'use client';

/* eslint-disable react/no-unescaped-entities */

import { dict, useLang } from '../lib/i18n';
import type { ReactNode } from 'react';

export default function PrivacyPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const content: Record<'en' | 'ar', ReactNode> = {
    en: (
      <>
        <p className="opacity-80 text-sm">Last updated: 10/9/2025</p>
        <p className="opacity-80 text-sm">
          This Privacy Policy explains how ELTX (“we”, “us”) collects, uses, and protects personal data in connection with our
          Services.
        </p>
        <ol className="list-decimal pl-4 space-y-4 text-sm opacity-80">
          <li className="space-y-1">
            <p className="font-medium">Data Controller</p>
            <p>
              info.eltx@gmail.com is the controller of personal data processed via the Services. Contact:
              info.eltx@gmail.com.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Data We Collect</p>
            <p>Account data: name, email, phone (if provided), authentication identifiers.</p>
            <p>Usage & device data: IP address, timestamps, device/browser info, cookies, and analytics events.</p>
            <p>Blockchain data: deposit/withdrawal addresses, transaction hashes, balances, network identifiers.</p>
            <p>KYC/AML data (where required): identity documents, verification outcomes, sanctions screening results.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">How We Use Data</p>
            <p>To operate and improve the Services (create deposits/withdrawals, update balances, provide support).</p>
            <p>To meet legal and compliance obligations (KYC/AML, record-keeping, fraud monitoring).</p>
            <p>To communicate about service, security, and policy updates.</p>
            <p>To analyze performance, diagnose issues, and prevent abuse.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Cookies & Similar Technologies</p>
            <p>
              We use essential cookies for login and session management, and optional analytics cookies to improve product
              quality. You can manage cookie preferences via your browser; disabling certain cookies may impair functionality.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Sharing & Disclosure</p>
            <p>We may share data with:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Service providers (hosting, analytics, security, KYC) under data-processing agreements.</li>
              <li>Regulators/law enforcement when legally required.</li>
              <li>Corporate transactions (mergers/acquisitions) subject to safeguards.</li>
            </ul>
            <p>We do not sell personal data.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">International Transfers</p>
            <p>
              Data may be processed in countries outside your own. Where required, we use appropriate safeguards (e.g., standard
              contractual clauses).
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Data Retention</p>
            <p>
              We retain data as long as necessary to provide the Services and meet legal/record-keeping obligations, then delete
              or pseudonymize it per our retention policy.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Security</p>
            <p>
              We employ access controls, encryption in transit, and audit logging. No method is perfectly secure—please notify us
              promptly of any suspected incident at info.eltx@gmail.com.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Your Rights</p>
            <p>
              Depending on your location, you may have rights to access, rectify, delete, restrict or object to processing, and
              data portability. To exercise rights, contact info.eltx@gmail.com. We may need to verify account ownership.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Children</p>
            <p>
              The Services are not directed to children under 18. If you believe a minor provided data, contact us to remove it.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Changes to This Policy</p>
            <p>
              We may update this Policy from time to time. We will post the new “Last updated” date and, where appropriate,
              provide additional notice. Continued use after changes signifies acceptance.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">Contact</p>
            <p>Privacy inquiries: info.eltx@gmail.com</p>
            <p>General support: info.eltx@gmail.com</p>
          </li>
        </ol>
      </>
    ),
    ar: (
      <>
        <p className="opacity-80 text-sm">آخر تحديث: 10/9/2025</p>
        <p className="opacity-80 text-sm">
          توضح سياسة الخصوصية هذه كيف تجمع ELTX ("نحن") البيانات الشخصية وتستخدمها وتحميها فيما يتعلق بخدماتنا.
        </p>
        <ol className="list-decimal pl-4 space-y-4 text-sm opacity-80">
          <li className="space-y-1">
            <p className="font-medium">المتحكم بالبيانات</p>
            <p>
              info.eltx@gmail.com هو الجهة المسؤولة عن معالجة البيانات الشخصية عبر الخدمات. للتواصل: info.eltx@gmail.com.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">البيانات التي نجمعها</p>
            <p>بيانات الحساب: الاسم، البريد الإلكتروني، الهاتف (إن وجد)، معرّفات المصادقة.</p>
            <p>
              بيانات الاستخدام والجهاز: عنوان IP، الطوابع الزمنية، معلومات الجهاز/المتصفح، ملفات تعريف الارتباط، وأحداث
              التحليلات.
            </p>
            <p>بيانات البلوكشين: عناوين الإيداع/السحب، هاشات المعاملات، الأرصدة، معرفات الشبكات.</p>
            <p>بيانات اعرف عميلك ومكافحة غسل الأموال عند الحاجة: مستندات الهوية، نتائج التحقق، نتائج فحص العقوبات.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">كيفية استخدامنا للبيانات</p>
            <p>لتشغيل الخدمات وتحسينها (إنشاء الإيداعات/السحوبات، تحديث الأرصدة، تقديم الدعم).</p>
            <p>
              لتلبية الالتزامات القانونية والامتثال (اعرف عميلك/مكافحة غسل الأموال، حفظ السجلات، مراقبة الاحتيال).
            </p>
            <p>للتواصل بشأن الخدمة والأمان وتحديثات السياسات.</p>
            <p>لتحليل الأداء وتشخيص المشكلات ومنع الإساءة.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">ملفات تعريف الارتباط والتقنيات المشابهة</p>
            <p>
              نستخدم ملفات تعريف ارتباط أساسية لتسجيل الدخول وإدارة الجلسات، وملفات تعريف ارتباط تحليلية اختيارية لتحسين
              جودة المنتج. يمكنك إدارة تفضيلات ملفات تعريف الارتباط عبر متصفحك؛ قد يؤثر تعطيل بعض الملفات على الوظائف.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">المشاركة والإفصاح</p>
            <p>قد نشارك البيانات مع:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>مقدمي الخدمات (الاستضافة، التحليلات، الأمان، اعرف عميلك) بموجب اتفاقيات معالجة البيانات.</li>
              <li>الجهات التنظيمية/إنفاذ القانون عند الطلب القانوني.</li>
              <li>الصفقات المؤسسية (الاندماج/الاستحواذ) وفقًا للضمانات.</li>
            </ul>
            <p>لا نبيع البيانات الشخصية.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">التحويلات الدولية</p>
            <p>قد تتم معالجة البيانات في دول خارج بلدك. عند الحاجة، نستخدم الضمانات المناسبة (مثل الشروط التعاقدية القياسية).</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الاحتفاظ بالبيانات</p>
            <p>
              نحتفظ بالبيانات طالما كان ذلك ضروريًا لتقديم الخدمات والوفاء بالالتزامات القانونية وحفظ السجلات، ثم نحذفها
              أو نجعلها مستعارة وفقًا لسياسة الاحتفاظ لدينا.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الأمان</p>
            <p>
              نستخدم ضوابط وصول وتشفيرًا أثناء النقل وتسجيلًا للتدقيق. لا توجد وسيلة آمنة تمامًا—يرجى إخطارنا فورًا بأي
              حادث مشتبه به على info.eltx@gmail.com.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">حقوقك</p>
            <p>
              اعتمادًا على موقعك، قد تكون لديك حقوق للوصول إلى البيانات وتصحيحها وحذفها وتقييد أو الاعتراض على المعالجة
              ونقل البيانات. لممارسة الحقوق، تواصل معنا عبر info.eltx@gmail.com. قد نحتاج إلى التحقق من ملكية الحساب.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الأطفال</p>
            <p>الخدمات غير موجهة للأطفال دون 18 عامًا. إذا تعتقد أن قاصرًا قد قدم بيانات، فاتصل بنا لإزالتها.</p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">التغييرات على هذه السياسة</p>
            <p>
              قد نحدّث هذه السياسة من حين لآخر. سننشر تاريخ "آخر تحديث" الجديد، وعند الحاجة، نقدم إشعارًا إضافيًا.
              استمرارك في الاستخدام بعد التغييرات يعني قبولها.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium">الاتصال</p>
            <p>الاستفسارات المتعلقة بالخصوصية: info.eltx@gmail.com</p>
            <p>الدعم العام: info.eltx@gmail.com</p>
          </li>
        </ol>
      </>
    ),
  } as const;
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.privacy}</h1>
      {content[lang]}
    </div>
  );
}
