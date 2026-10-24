"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function RoomStudio({ children, step = 0 }: { children: React.ReactNode; step?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const [example, setExample] = useState(0);
  const examples = ["Soft light, open space", "Warm tones, quiet corners", "Less clutter, more room"];

  useGSAP(() => {
    if (typeof window.matchMedia !== "function") return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".studio-intro > *", { y: 16, opacity: 0, duration: 0.7, stagger: 0.09, ease: "power2.out", clearProps: "all" });
      gsap.fromTo(".studio-reveal-word", { opacity: 0.3 }, {
        opacity: 1, stagger: 0.08,
        scrollTrigger: { trigger: ".studio-story", start: "top 90%", end: "top 55%", scrub: true },
      });
      gsap.utils.toArray<HTMLElement>(".studio-stack-card").forEach((card, index) => {
        gsap.from(card, { y: 36 + index * 12, rotation: index === 0 ? -2 : 0, opacity: 0,
          scrollTrigger: { trigger: card, start: "top 95%", end: "top 70%", scrub: true } });
      });
    });
    return () => media.revert();
  }, { scope: root });

  const skipToWorkspace = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const target = root.current?.querySelector<HTMLElement>("#room-workspace");
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: "start" });
  };

  return (
    <div className="studio" ref={root}>
      <a className="studio-skip" href="#room-workspace" onClick={skipToWorkspace}>Skip to workspace</a>
      <header className="studio-nav">
        <Link href="/" className="studio-brand" aria-label="Roomify home">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 26V13a10 10 0 0 1 20 0v13M6 26h8V16h12" stroke="currentColor" strokeWidth="2"/><path d="M14 26h12" stroke="currentColor" strokeWidth="2"/></svg>
          roomify<span className="studio-brand-dot">.</span>
        </Link>
        <nav aria-label="Main navigation"><Link href="/new-room">New room</Link><Link className="studio-nav-link" href="/ui-preview">Explore preview <span aria-hidden="true">↗</span></Link></nav>
      </header>
      <main className="studio-main overflow-x-hidden w-full max-w-full">
        <section className="studio-intro" aria-label="Room design workspace">
          <p className="studio-eyebrow">Your space. A fresh perspective.</p>
          <h1 className="max-w-5xl">A room full of<br/><span>possibility.</span><span className="studio-inline-room" aria-hidden="true" /></h1>
          <div className="studio-intro-bottom"><p>Start with the room you have.<br/>Discover what it could become.</p><ol className="studio-steps" aria-label="Room design progress">{["Upload", "Analyze", "Review"].map((label, i) => <li key={label} aria-current={i === step ? "step" : undefined} data-complete={i < step}><span aria-hidden="true">{i < step ? "✓" : i + 1}</span>{label}</li>)}</ol></div>
        </section>
        <section id="room-workspace" className="studio-workspace" tabIndex={-1} aria-label="Room workspace">{children}</section>
        <section className="studio-story" aria-labelledby="studio-story-title">
          <div className="studio-story-heading"><h2 id="studio-story-title">Small changes.<br/>A different feeling.</h2><p>{"Good design starts with seeing your space a little differently.".split(" ").map((word, i) => <React.Fragment key={i}><span className="studio-reveal-word">{word}</span>{" "}</React.Fragment>)}</p></div>
          <div className="studio-bento grid-flow-dense">
            <article className="studio-stack-card studio-example">
              <div className={`studio-example-image studio-example-${example}`} role="img" aria-label="Illustrated living room inspiration" />
              <div className="studio-example-caption"><div><p>Room inspiration</p><h3 aria-live="polite">{examples[example]}</h3></div><div className="studio-example-controls"><button type="button" aria-label="Previous room inspiration" onClick={() => setExample((example + 2) % 3)}>←</button><button type="button" aria-label="Next room inspiration" onClick={() => setExample((example + 1) % 3)}>→</button></div></div>
            </article>
            <article className="studio-stack-card studio-tip"><span className="studio-tip-icon" aria-hidden="true">↗</span><h3>A little light<br/>goes a long way.</h3><p>Photograph your room in daylight. Keep the furniture in view and let the details speak.</p></article>
            <article className="studio-stack-card studio-tip studio-tip-dark"><span className="studio-tip-icon" aria-hidden="true">⌑</span><h3>Your room.<br/>Your starting point.</h3><p>Review what is already there before imagining what comes next.</p></article>
          </div>
          <div className="studio-marquee" aria-hidden="true"><div>{Array.from({ length: 2 }, (_, i) => <span key={i}>Warm minimalism <i/> Natural textures <i/> Thoughtful spaces <i/> Room to breathe <i/></span>)}</div></div>
        </section>
        <footer className="studio-footer"><div><p>Make room for something new.</p><a href="#room-workspace" onClick={skipToWorkspace}>Back to your room <span aria-hidden="true">↗</span></a></div><span>roomify / space to imagine</span></footer>
      </main>
    </div>
  );
}
