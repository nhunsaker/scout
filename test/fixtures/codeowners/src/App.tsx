import { Cart } from "./checkout/Cart";
import { SearchBox } from "./search/SearchBox";
import { OldThing } from "./legacy/OldThing";
import { WebButton } from "@example/web-button/dist/react.js";

export function App() {
  return (
    <>
      <Cart />
      <SearchBox />
      <OldThing />
      <WebButton variant="primary">Save</WebButton>
    </>
  );
}
