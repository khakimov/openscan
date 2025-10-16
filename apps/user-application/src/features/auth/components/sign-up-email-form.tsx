import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod/v4";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "better-auth";
import { InputWithLabel } from "@/components/shared/forms/input-with-label";
import { Button } from "@/components/ui/button";

const validator = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type IForm = z.infer<typeof validator>;

export function SignUpEmailForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<IForm>({
    resolver: zodResolver(validator),
  });

  const onSubmit: SubmitHandler<IForm> = async (values) => {
    setIsLoading(true);

    try {
      const { error } = await authClient.signUp.email({
        email: values.email,
        password: values.password,
        name: `${values.firstName} ${values.lastName}`,
      });

      if (error) {
        toast.error(error.message || "Sign up failed");
      } else {
        toast.success(
          "Account created! Please check your email to verify your account."
        );
        // Redirect to a "check your email" page or login
        router.navigate({ to: "/login" });
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-6">
      <h3 className="text-2xl font-medium text-left">Sign up with email</h3>

      <div className="grid grid-cols-2 gap-4">
        <InputWithLabel
          {...form.register("firstName")}
          error={form.formState.errors.firstName?.message}
          label="First name"
          type="text"
          autoComplete="given-name"
        />

        <InputWithLabel
          {...form.register("lastName")}
          error={form.formState.errors.lastName?.message}
          label="Last name"
          type="text"
          autoComplete="family-name"
        />
      </div>

      <InputWithLabel
        {...form.register("email")}
        error={form.formState.errors.email?.message}
        label="Work Email"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
      />

      <InputWithLabel
        {...form.register("password")}
        error={form.formState.errors.password?.message}
        label="Password"
        type="password"
        autoComplete="new-password"
      />

      <InputWithLabel
        {...form.register("confirmPassword")}
        error={form.formState.errors.confirmPassword?.message}
        label="Confirm Password"
        type="password"
        autoComplete="new-password"
      />

      <Button type="submit" loading={isLoading} disabled={isLoading}>
        Create account
      </Button>

      <p className="text-sm text-muted-foreground text-center">
        By creating an account, you agree to our Terms of Service and Privacy
        Policy
      </p>
    </form>
  );
}
