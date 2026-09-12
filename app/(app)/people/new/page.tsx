import { PageHeader } from "@/components/ui";
import PersonForm from "@/components/PersonForm";

export default function NewPersonPage() {
  return (
    <div>
      <PageHeader title="Add a person" subtitle="Someone you lend to or borrow from." />
      <PersonForm />
    </div>
  );
}
