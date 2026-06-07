"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import type { RankPromotionEventDetail } from "@/game/scoring";

interface PromotionModalProps {
  promotion: RankPromotionEventDetail;
  onClose: () => void;
}

const BLUE_MINION_RENDER_URL = "/assets/blue-minion.webp";

const promotionMessages = [
  "Promotion secured. The group chat is in shambles.",
  "LP acquired. Ego buff authorized.",
  "Your friends have been politely out-knowledge-diffed.",
  "Blue minion approves. Wave management optional.",
  "Rank up detected. Screenshots are now socially acceptable.",
  "You may now say rank diff with deeply suspicious confidence.",
  "The climb continues. Your duo is taking partial credit.",
  "Congratulations. Your next mistake is officially strategic."
];

export function PromotionModal({ promotion, onClose }: PromotionModalProps) {
  const [message] = useState(() => promotionMessages[Math.floor(Math.random() * promotionMessages.length)] ?? promotionMessages[0]);
  const rankEmblemUrl = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${promotion.tier.toLowerCase()}.png`;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="promotion-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="promotion-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
        <button type="button" className="promotion-close" onClick={onClose} aria-label="Close promotion celebration">
          <X size={18} />
        </button>

        <div className="promotion-modal__frame" />
        <div className="promotion-modal__header">
          <span className="promotion-modal__eyebrow">Promotion</span>
          <h2 id="promotion-title">Rank Up</h2>
        </div>

        <div className="promotion-stage">
          <div className="promotion-stage__ring" />
          <div className="promotion-stage__burst" />
          <div className="promotion-new-rank">{promotion.toRank}</div>
          <div className="promotion-emblem-shell" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="promotion-emblem" src={rankEmblemUrl} alt="" />
          </div>
          <div className="promotion-minion-dialogue">
            <div className="promotion-speech">{message}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="promotion-minion" src={BLUE_MINION_RENDER_URL} alt="" />
          </div>
        </div>

        <div className="promotion-modal__footer">
          <span className="promotion-lp">
            {promotion.lp} LP
            {typeof promotion.lpChange === "number" && (
              <b>
                {promotion.lpChange > 0 ? "+" : ""}
                {promotion.lpChange}
              </b>
            )}
          </span>
          <button type="button" className="promotion-action" onClick={onClose}>
            Continue
          </button>
        </div>
      </section>
    </div>
  );
}
