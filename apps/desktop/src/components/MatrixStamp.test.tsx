import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatrixStamp } from "./MatrixStamp";

describe("MatrixStamp", () => {
  it("joins values with the interpunct separator", () => {
    render(<MatrixStamp values={["-9.4 LUFS", "-1.1 dBTP", "24bit/48k"]} />);
    expect(
      screen.getByText("-9.4 LUFS · -1.1 dBTP · 24bit/48k"),
    ).toBeInTheDocument();
  });

  it("renders quiet text-secondary at rest", () => {
    render(<MatrixStamp values={["-9.4 LUFS"]} />);
    expect(screen.getByTestId("matrix-stamp")).toHaveClass(
      "text-text-secondary",
    );
  });

  it("renders brand green when a fresh render result", () => {
    render(<MatrixStamp values={["-9.4 LUFS"]} fresh />);
    const stamp = screen.getByTestId("matrix-stamp");
    expect(stamp).toHaveClass("text-brand");
    expect(stamp).not.toHaveClass("text-text-secondary");
  });
});
