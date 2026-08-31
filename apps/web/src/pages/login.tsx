import { useLogin } from '@shop/state';
import { Smartphone, Store } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

/** Phase 1 auth stub — email only, resolved against the seeded user list. */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Shop Suite</h1>
            <p className="text-xs text-muted-foreground">Sales & Inventory Management</p>
          </div>
        </div>

        <form onSubmit={onSubmit}>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@shop.in"
          />

          {login.error ? (
            <p className="mt-2 text-xs text-destructive">{(login.error as Error).message}</p>
          ) : null}

          <Label htmlFor="password" className="mt-3">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <Button
            type="submit"
            className="mt-4 w-full"
            disabled={login.isPending || !email || !password}
          >
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 border-t border-border pt-4">
          <Link
            to="/download"
            className="flex items-center gap-2 text-xs font-medium text-primary hover:underline"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Get the Android app for the counter
          </Link>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Sign-in is verified by the API against an argon2 hash. Ask your administrator to create
            your account and set your password — there is no self-service sign-up.
          </p>
        </div>
      </div>
    </div>
  );
}
