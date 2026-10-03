import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "../src/app/page";

describe("Homepage room entry", () => {
  it("takes a visitor to the one-photo room creation flow", () => {
    render(<HomePage />);

    expect(screen.getByRole("link", { name: /create room/i })).toHaveAttribute(
      "href",
      "/new-room"
    );
    expect(screen.getByText(/one photo/i)).toBeInTheDocument();
  });
});
