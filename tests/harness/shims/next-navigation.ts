export function useRouter() {
  return {
    push: (url: string) => {
      window.location.href = url;
    },
    replace: (url: string) => {
      window.location.replace(url);
    },
    prefetch: () => {},
    back: () => {
      window.history.back();
    },
    forward: () => {
      window.history.forward();
    },
    refresh: () => {
      window.location.reload();
    },
  };
}

export function usePathname() {
  return window.location.pathname;
}

export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}

export function useParams() {
  return {};
}
