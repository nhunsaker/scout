import { Card } from "./components/Card";
import { Field } from "./components/Field";
import { WebButton } from "@example/web-button/dist/react.js";

export function App() {
  return (
    <>
      <Card title="Welcome" subtitle="Read me" />
      <Field label="Name" />
      <WebButton variant="primary">Save</WebButton>
    </>
  );
}
