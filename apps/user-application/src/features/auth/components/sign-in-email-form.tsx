import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod/v4";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { InputWithLabel } from "@/components/shared/forms/input-with-label";
import { Button } from "@/components/ui/button";

const validator = z.object({
  email: z
    .union([z.literal(""), z.email("Please enter a valid email address")])
    .refine((val) => val !== "", { message: "Email is required" }),
  password: z.string().min(1, "Password is required"),
});

type IForm = z.infer<typeof validator>;

export function SignInEmailForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<
    z.input<typeof validator>,
    any,
    z.output<typeof validator>
  >({
    // @ts-expect-error - Zod v4 type mismatch with @hookform/resolvers
    resolver: zodResolver(validator),
  });

  const onSubmit: SubmitHandler<IForm> = async (values) => {
    setIsLoading(true);

    try {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (error) {
        if (error.message?.includes("not verified")) {
          toast.error("Please verify your email before signing in. Check your inbox.");
        } else {
          toast.error(error.message || "Invalid email or password");
        }
      } else {
        toast.success("Welcome back!");
        // Invalidate router to refetch user and redirect to dashboard
        await router.invalidate();
        await router.navigate({ to: "/" });
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-6">
      <h3 className="text-2xl font-medium text-left">Sign in with email</h3>

      <InputWithLabel
        {...form.register("email")}
        error={form.formState.errors.email?.message}
        label="Email"
        type="email"
        autoComplete="email"
      />

      <InputWithLabel
        {...form.register("password")}
        error={form.formState.errors.password?.message}
        label="Password"
        type="password"
        autoComplete="current-password"
      />

      <Button type="submit" disabled={isLoading}>
        {isLoading && <Loader2 className="animate-spin" />}
        Sign in
      </Button>

      <button
        type="button"
        onClick={() => {
          // TODO: Implement password reset modal or navigation
          console.log("Forgot password for:", form.getValues("email"));
        }}
        className="text-sm text-muted-foreground hover:underline"
      >
        Forgot password?
      </button>
    </form>
  );
}
