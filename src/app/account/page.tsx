import { redirect } from "next/navigation";
import { currentUser } from "@/lib/authz";
import { PageHeader, Card, CardHeader, CardBody } from "@/components/ui";
import { AccountProfileForm } from "@/components/account-profile-form";
import { AccountPasswordForm } from "@/components/account-password-form";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <PageHeader title="Account settings" subtitle="Update your profile and password" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            <AccountProfileForm name={user.name ?? ""} email={user.email ?? ""} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Change password" />
          <CardBody>
            <AccountPasswordForm />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
