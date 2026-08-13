"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function useSoftRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return {
    pending,
    softRefresh() {
      startTransition(() => {
        router.refresh();
      });
    },
    softPush(href: string) {
      startTransition(() => {
        router.push(href);
      });
    },
  };
}
