import { Metadata } from 'next';
import { Plane } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | El-Exir ERP',
  description: 'Privacy Policy for El-Exir Tourism Management System',
};

export default function PrivacyPolicyPage() {
  const lastUpdated = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-slate-900 font-semibold group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, hsl(217 91% 50%) 0%, hsl(262 83% 58%) 100%)',
              }}
            >
              <Plane size={18} className="text-white" />
            </div>
            <span className="text-lg">El-Exir</span>
          </Link>
          <div className="text-sm text-slate-500 font-medium">
            Last Updated: {lastUpdated}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 pt-12 animate-fade-in">
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4 text-slate-900">Privacy Policy</h1>
          <p className="text-lg text-slate-600 leading-relaxed">
            This Privacy Policy describes how El-Exir (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, and shares your personal information when you use our Tourism Management System applications and services.
          </p>
        </div>

        <div className="space-y-12 bg-white p-8 sm:p-10 rounded-2xl shadow-sm border border-slate-100">
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900">1. Information we collect</h2>
            <div className="text-slate-600 leading-relaxed space-y-4">
              <p>We collect information you provide directly to us when you use our system. This includes:</p>
              <ul className="list-disc pl-6 space-y-2 marker:text-slate-400">
                <li><strong className="text-slate-800">Account Information:</strong> Name, email address, and role when creating an account.</li>
                <li><strong className="text-slate-800">Customer Data:</strong> Information about your tourism clients, including their names, contact details, travel preferences, and booking history entered into the CRM.</li>
                <li><strong className="text-slate-800">Communication Data:</strong> Messages, emails, and notes exchanged through our platform.</li>
                <li><strong className="text-slate-800">Usage Data:</strong> Information about how you interact with our application, including log data, device information, and IP addresses.</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900">2. How we use information</h2>
            <div className="text-slate-600 leading-relaxed space-y-4">
              <p>We use the collected information for the following purposes:</p>
              <ul className="list-disc pl-6 space-y-2 marker:text-slate-400">
                <li>To provide, maintain, and improve our services.</li>
                <li>To manage your account and provide customer support.</li>
                <li>To facilitate your CRM operations and client management.</li>
                <li>To send administrative information, such as updates, security alerts, and support messages.</li>
                <li>To monitor and analyze trends, usage, and activities in connection with our services.</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900">3. Facebook/Messenger data</h2>
            <div className="text-slate-600 leading-relaxed space-y-4">
              <p>
                Our platform integrates with Meta/Facebook services to provide omnichannel communication capabilities. When you connect your Facebook Pages or Messenger:
              </p>
              <ul className="list-disc pl-6 space-y-2 marker:text-slate-400">
                <li>We access and store messages sent to your connected pages to display them in our unified inbox.</li>
                <li>We store basic profile information (such as name and profile picture) of users interacting with your pages to identify them in the CRM.</li>
                <li>We do not use this data for any purpose other than providing the messaging functionality within your El-Exir workspace.</li>
                <li>This data is strictly siloed per workspace and is never shared with third parties or used for advertising.</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900">4. Data storage and security</h2>
            <div className="text-slate-600 leading-relaxed space-y-4">
              <p>
                We prioritize the security of your data. We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. Your data is stored on secure cloud infrastructure with strict access controls and encryption at rest and in transit.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900">5. Data sharing</h2>
            <div className="text-slate-600 leading-relaxed space-y-4">
              <p>We do not sell your personal data. We may share your information only in the following circumstances:</p>
              <ul className="list-disc pl-6 space-y-2 marker:text-slate-400">
                <li><strong className="text-slate-800">Service Providers:</strong> We may share data with trusted third-party vendors who assist us in operating our application and conducting our business (e.g., secure hosting providers, email delivery services).</li>
                <li><strong className="text-slate-800">Legal Requirements:</strong> We may disclose information if required to do so by law or in response to valid requests by public authorities.</li>
                <li><strong className="text-slate-800">Business Transfers:</strong> In connection with any merger, sale of company assets, financing, or acquisition of all or a portion of our business.</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900">6. User data deletion</h2>
            <div className="text-slate-600 leading-relaxed space-y-4">
              <p>
                You have the right to request the deletion of your personal data and any connected third-party data (such as Facebook/Messenger integrations). 
              </p>
              <p>
                To request data deletion, please contact us at the email address provided in the Contact Information section. We will process your request and permanently delete the requested data within 30 days, unless we are legally required to retain specific records.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900">7. User rights</h2>
            <div className="text-slate-600 leading-relaxed space-y-4">
              <p>Depending on your location, you may have certain rights regarding your personal information, including:</p>
              <ul className="list-disc pl-6 space-y-2 marker:text-slate-400">
                <li>The right to access the personal information we hold about you.</li>
                <li>The right to request correction of inaccurate data.</li>
                <li>The right to request deletion of your personal data.</li>
                <li>The right to restrict or object to our processing of your data.</li>
                <li>The right to data portability.</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-slate-900">8. Contact information</h2>
            <div className="text-slate-600 leading-relaxed space-y-4">
              <p>
                If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us through our official support channels at:
              </p>
              <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-100 inline-block">
                <span className="font-semibold text-slate-800 mr-2">Email:</span> 
                <a href="mailto:support@el-exir.com" className="text-blue-600 hover:text-blue-700 hover:underline font-medium">
                  support@el-exir.com
                </a>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
