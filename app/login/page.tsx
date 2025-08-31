import Header from '../(site)/components/Header';

export default function LoginPage() {
  return (
    <main>
      <Header />
      <div className="container py-8">
        <h1 className="text-2xl mb-4">Login</h1>
        <form action="/auth/login" method="post" className="flex flex-col gap-4 max-w-md">
          <input className="border p-2" type="email" name="email" placeholder="Email" required />
          <input className="border p-2" type="password" name="password" placeholder="Password" required />
          <button className="bg-blue-500 text-white px-4 py-2" type="submit">
            Login
          </button>
        </form>
      </div>
    </main>
  );
}
