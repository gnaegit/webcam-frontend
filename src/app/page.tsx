"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-3xl font-bold mb-6">Welcome</h1>
      <Link href="/camera">
        <Button variant="default" size="lg">
          Go to Camera Page
        </Button>
      </Link>
    </div>
  );
}
