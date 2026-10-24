import React, { forwardRef } from "react";

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: any;
  as?: any;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  prefetch?: boolean;
  locale?: string | false;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, children, ...rest }, ref) => {
    const hrefStr =
      typeof href === "object" && href !== null
        ? href.pathname || href.href || ""
        : href || "";

    return (
      <a ref={ref} href={hrefStr} {...rest}>
        {children}
      </a>
    );
  }
);

Link.displayName = "Link";

export default Link;
export { Link };
