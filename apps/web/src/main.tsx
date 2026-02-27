import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createAppRouter } from "./router";
import { queryClient, trpc } from "./lib/trpc";
import "./styles.css";
import "./landing.css";

const router = createAppRouter();

router.update({
  context: {
    queryClient,
    trpc,
  },
});

const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
