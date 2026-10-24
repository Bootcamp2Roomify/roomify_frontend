import { AuthForm } from "@/features/auth/AuthForm";

export const metadata = { title: "Create account - Roomify" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="register" next={next ?? null} />;
}
