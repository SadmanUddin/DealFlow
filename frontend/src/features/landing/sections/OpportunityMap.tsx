import { useId, useState } from "react";
import { Layers3, Minus, Plus } from "lucide-react";

const river =
  "M -80 612 C 68 555 183 585 307 484 S 477 375 573 350 S 697 229 746 199 S 927 96 1035 -54";
const avenues =
  "M -100 307 H 938 M 116 -220 V 720 M 320 -220 V 720 M 542 -220 V 720 M 776 -220 V 720 M -140 103 H 1010 M -140 552 H 1100";

export function OpportunityMap() {
  const [zoom, setZoom] = useState(0);
  const id = useId();

  return (
    <div className="dealflow-map" role="group" aria-label="Illustrative map">
      <div className="dealflow-map-art" aria-hidden="true">
        <svg
          viewBox="0 0 930 640"
          preserveAspectRatio="xMidYMid slice"
          data-zoom={zoom}
          className="dealflow-map-drawing"
        >
          <defs>
            <pattern
              id={id}
              width="104"
              height="104"
              patternUnits="userSpaceOnUse"
            >
              <rect width="104" height="104" fill="#eee9dd" />
              <path
                d="M0 0H104V104H0ZM0 33H104M0 72H104M29 0V72M69 33V104"
                fill="none"
                stroke="#faf8f0"
                strokeWidth="5"
              />
              <path
                d="M5 5H23V26H5ZM36 5H97V26H36ZM35 40H62V64H35ZM76 80H97V98H76Z"
                fill="#e4dfd1"
              />
              <path d="M5 79H60V98H5Z" fill="#dce5d3" />
            </pattern>
          </defs>
          <rect
            x="-280"
            y="-340"
            width="1600"
            height="1380"
            fill={`url(#${id})`}
            transform="rotate(-17 510 340)"
          />
          <g transform="rotate(-17 510 340)" fill="none">
            <path d={avenues} stroke="#d7cebc" strokeWidth="14" />
            <path d={avenues} stroke="#fbf8ea" strokeWidth="11" />
          </g>
          <path
            d="M 704 16 Q 768 -4 817 31 L 795 98 726 115 673 73Z M 559 444 636 412 693 453 716 519 619 545 575 512Z M 219 299 300 277 358 333 300 386 220 361Z"
            fill="#d5e2cd"
            stroke="#e9eee0"
            strokeWidth="4"
          />
          <path d={river} fill="none" stroke="#cdd9cc" strokeWidth="57" />
          <path d={river} fill="none" stroke="#dbe7e3" strokeWidth="49" />
          <path
            d="m250 451 31 64m266-203 18 79m148-198 52 48m43-124 39 65"
            stroke="#fbf8ea"
            strokeWidth="8"
          />
          <path
            className="dealflow-map-route"
            d="M56 520 179 482 203 410 318 375 374 390 469 362 448 290 552 258 579 220 673 191 654 125 805 78"
            fill="none"
            stroke="#318363"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 8"
          />
          <g
            fill="#3b5c50"
            fontSize="11"
            letterSpacing="3"
            fontWeight="600"
            opacity=".65"
          >
            <text x="541" y="106" transform="rotate(-17 541 106)">
              NORTH QUARTER
            </text>
            <text x="696" y="576" transform="rotate(-17 696 576)">
              RIVER DISTRICT
            </text>
          </g>
        </svg>
      </div>
      <div className="dealflow-map-controls">
        <span>
          <Layers3 size={15} aria-hidden="true" /> Illustrative map
        </span>
        <div className="dealflow-map-zoom">
          <button
            aria-label="Zoom out on illustrative map"
            aria-disabled={zoom === 0}
            onClick={() => setZoom(Math.max(0, zoom - 1))}
            type="button"
          >
            <Minus size={17} aria-hidden="true" />
          </button>
          <button
            aria-label="Zoom in on illustrative map"
            aria-disabled={zoom === 2}
            onClick={() => setZoom(Math.min(2, zoom + 1))}
            type="button"
          >
            <Plus size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
