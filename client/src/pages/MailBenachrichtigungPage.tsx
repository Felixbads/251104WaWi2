import EmailNotificationsSettings from "@/components/email/EmailNotificationsSettings";

export default function MailBenachrichtigungPage() {
  return (
    <div className="container mx-auto py-6">
      <EmailNotificationsSettings showHeader={true} />
    </div>
  );
}