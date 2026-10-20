import { Suspense } from "react";
import { ChatPage } from "../chat/chat-page";

export default function Home() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}
