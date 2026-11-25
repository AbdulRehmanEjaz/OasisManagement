import Login from "@/components/login";

export const metadata = {
  title: "ADVACON · Vehicles Management Login",
};

export default function Page() {
  return (
    <Login
      destination="/fleet"
      heading="Welcome to Vehicles Management"
    />
  );
}
