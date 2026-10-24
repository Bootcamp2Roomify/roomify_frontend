import { AuthForm } from "@/features/auth/AuthForm";

export const metadata = { title: "Log in - Roomify" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="login" next={next ?? null} />;
}
