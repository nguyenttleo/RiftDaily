export function NexusLoader() {
  return (
    <div className="nexus-loader" role="status" aria-label="Loading Rift Daily">
      <div className="nexus-loader__stage" aria-hidden="true">
        <div className="nexus-health">
          <div className="nexus-health__frame">
            <div className="nexus-health__fill" />
            <div className="nexus-health__damage" />
            <div className="nexus-health__ticks">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>

        <div className="nexus-scene">
          <div className="nexus-respawn-ring" />
          <div className="nexus-platform">
            <span className="nexus-platform__rune nexus-platform__rune--left" />
            <span className="nexus-platform__rune nexus-platform__rune--right" />
          </div>
          <div className="nexus-core">
            <span className="nexus-core__aura" />
            <svg className="nexus-model" viewBox="0 0 220 230" role="presentation" focusable="false">
              <defs>
                <linearGradient id="nexus-stone" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#8c8f7f" />
                  <stop offset="42%" stopColor="#3e574f" />
                  <stop offset="100%" stopColor="#202a2d" />
                </linearGradient>
                <linearGradient id="nexus-gold" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#d1a85d" />
                  <stop offset="45%" stopColor="#7a6339" />
                  <stop offset="100%" stopColor="#332f22" />
                </linearGradient>
                <linearGradient id="nexus-red-core" x1="35%" x2="75%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#ff5d68" />
                  <stop offset="45%" stopColor="#d22331" />
                  <stop offset="100%" stopColor="#550a12" />
                </linearGradient>
                <radialGradient id="nexus-red-glow" cx="50%" cy="42%" r="62%">
                  <stop offset="0%" stopColor="#ff9292" stopOpacity="0.95" />
                  <stop offset="44%" stopColor="#e62a38" stopOpacity="0.58" />
                  <stop offset="100%" stopColor="#4c0309" stopOpacity="0" />
                </radialGradient>
              </defs>

              <ellipse className="nexus-model__ground-glow" cx="110" cy="184" rx="83" ry="34" />
              <g className="nexus-model__base">
                <path d="M17 177 C35 137 72 115 110 115 C148 115 185 137 203 177 C188 211 151 228 110 228 C69 228 32 211 17 177Z" fill="#12171b" opacity="0.74" />
                <ellipse cx="110" cy="176" rx="84" ry="34" fill="url(#nexus-stone)" />
                <ellipse cx="110" cy="173" rx="74" ry="25" fill="#10171b" opacity="0.8" />
                <path d="M21 169 C41 131 75 111 110 111 C145 111 179 131 199 169 L187 178 C169 150 140 133 110 133 C80 133 51 150 33 178Z" fill="#8c8f7f" opacity="0.38" />
                <path d="M28 172 C43 139 76 124 110 124 C144 124 177 139 192 172 L177 179 C162 155 138 143 110 143 C82 143 58 155 43 179Z" fill="#6c7e76" />
                <path d="M35 173 C51 145 80 133 110 133 C140 133 169 145 185 173 L173 178 C157 158 135 148 110 148 C85 148 63 158 47 178Z" fill="#20292d" />
                <path d="M23 178 L47 145 L73 151 L64 190 L34 197Z" fill="#2d403e" />
                <path d="M197 178 L173 145 L147 151 L156 190 L186 197Z" fill="#2d403e" />
                <path d="M31 176 L55 154 L79 157 L65 189 L37 191Z" fill="url(#nexus-gold)" />
                <path d="M189 176 L165 154 L141 157 L155 189 L183 191Z" fill="url(#nexus-gold)" />
                <path d="M57 155 L74 143 L93 150 L79 164Z" fill="#d1a85d" opacity="0.7" />
                <path d="M163 155 L146 143 L127 150 L141 164Z" fill="#d1a85d" opacity="0.7" />
                <path d="M32 170 C48 145 78 134 110 134 C142 134 172 145 188 170 C176 199 143 215 110 215 C77 215 44 199 32 170Z" fill="#243033" />
                <path d="M43 167 C59 151 83 143 110 143 C137 143 161 151 177 167 C159 181 135 188 110 188 C85 188 61 181 43 167Z" fill="#12181c" opacity="0.72" />
                <path d="M50 187 C69 204 91 211 110 211 C129 211 151 204 170 187" fill="none" stroke="#9aa99d" strokeLinecap="round" strokeWidth="4" opacity="0.28" />
                <path d="M58 174 L79 159 L99 166 L89 193 L61 194Z" fill="url(#nexus-gold)" />
                <path d="M162 174 L141 159 L121 166 L131 193 L159 194Z" fill="url(#nexus-gold)" />
                <path d="M83 202 L100 188 L120 188 L137 202 C128 210 92 210 83 202Z" fill="#51615c" />
                <path d="M87 151 C102 143 119 143 134 151 L126 161 C115 157 105 157 94 161Z" fill="#c79b53" />
                <path d="M73 190 C91 199 128 199 146 190" fill="none" stroke="#7f8f86" strokeLinecap="round" strokeWidth="5" opacity="0.5" />
                <path d="M69 181 C90 188 130 188 151 181" fill="none" stroke="#0b1115" strokeLinecap="round" strokeWidth="5" opacity="0.58" />
              </g>

              <g className="nexus-model__plates">
                <path d="M27 133 L55 86 L83 141 L62 169 C45 157 33 142 27 133Z" fill="#263b3b" />
                <path d="M193 133 L165 86 L137 141 L158 169 C175 157 187 142 193 133Z" fill="#263b3b" />
                <path d="M43 111 L70 78 L94 143 L70 163 C58 149 49 130 43 111Z" fill="url(#nexus-stone)" />
                <path d="M177 111 L150 78 L126 143 L150 163 C162 149 171 130 177 111Z" fill="url(#nexus-stone)" />
                <path d="M59 112 L73 95 L84 141 L72 151Z" fill="#91a59a" opacity="0.42" />
                <path d="M161 112 L147 95 L136 141 L148 151Z" fill="#91a59a" opacity="0.42" />
                <path d="M54 102 L69 88 L77 107 L62 118Z" fill="url(#nexus-gold)" />
                <path d="M166 102 L151 88 L143 107 L158 118Z" fill="url(#nexus-gold)" />
                <path d="M68 76 L96 44 L107 155 L84 167 C77 133 71 104 68 76Z" fill="#6f8278" />
                <path d="M152 76 L124 44 L113 155 L136 167 C143 133 149 104 152 76Z" fill="#6f8278" />
                <path d="M86 76 L97 62 L102 144 L91 152Z" fill="#a9b5a7" opacity="0.38" />
                <path d="M134 76 L123 62 L118 144 L129 152Z" fill="#a9b5a7" opacity="0.38" />
                <path d="M82 69 L96 58 L100 91 L86 99Z" fill="url(#nexus-gold)" />
                <path d="M138 69 L124 58 L120 91 L134 99Z" fill="url(#nexus-gold)" />
                <path d="M54 142 L73 134 L87 160 L65 173Z" fill="url(#nexus-gold)" opacity="0.82" />
                <path d="M166 142 L147 134 L133 160 L155 173Z" fill="url(#nexus-gold)" opacity="0.82" />
                <path d="M77 84 L89 76 M143 84 L131 76" stroke="#2ec7cb" strokeLinecap="round" strokeWidth="3" opacity="0.42" />
                <path d="M42 139 L60 132 M178 139 L160 132" stroke="#c79b53" strokeLinecap="round" strokeWidth="4" opacity="0.55" />
              </g>

              <g className="nexus-model__crystal">
                <path className="nexus-model__crystal-glow" d="M75 43 C91 9 129 9 145 43 C159 73 144 138 110 174 C76 138 61 73 75 43Z" fill="url(#nexus-red-glow)" />
                <polygon points="110 8 147 49 132 140 110 174 88 140 73 49" fill="url(#nexus-red-core)" />
                <polygon points="110 8 147 49 114 71" fill="#ff7f86" opacity="0.76" />
                <polygon points="114 71 147 49 132 140 112 174" fill="#980a18" opacity="0.86" />
                <polygon points="110 8 73 49 109 72" fill="#d82031" opacity="0.92" />
                <polygon points="73 49 88 140 110 174 109 72" fill="#f23b49" opacity="0.78" />
                <polygon points="109 72 114 71 112 174 110 174" fill="#ff8790" opacity="0.34" />
                <polygon points="88 140 110 174 112 174 102 134" fill="#6e0610" opacity="0.42" />
                <path d="M95 66 L123 30 M98 107 L131 78 M91 131 L116 151 M121 95 L139 62" stroke="#ffd5d5" strokeLinecap="round" strokeWidth="2" opacity="0.24" />
                <path d="M86 53 L109 72 L102 134" fill="none" stroke="#7c0711" strokeLinecap="round" strokeWidth="2" opacity="0.46" />
              </g>

              <g className="nexus-model__fragments">
                <polygon className="nexus-model__fragment nexus-model__fragment--one" points="101 67 114 75 104 92" />
                <polygon className="nexus-model__fragment nexus-model__fragment--two" points="122 52 137 61 124 78" />
                <polygon className="nexus-model__fragment nexus-model__fragment--three" points="88 92 101 106 87 121" />
                <polygon className="nexus-model__fragment nexus-model__fragment--four" points="117 125 132 140 112 156" />
              </g>

              <g className="nexus-model__swirls">
                <circle cx="75" cy="119" r="3" />
                <circle cx="146" cy="128" r="2.6" />
                <circle cx="108" cy="155" r="2.8" />
                <path d="M74 128 C95 111 127 112 148 130" fill="none" strokeWidth="2.5" />
                <path d="M88 154 C109 137 135 141 148 160" fill="none" strokeWidth="2" />
              </g>
            </svg>
            <span className="nexus-core__fracture" />
          </div>
          <div className="super-minion" aria-hidden="true">
            <span className="super-minion__shadow" />
            <svg className="super-minion-model" viewBox="0 0 240 180" role="presentation" focusable="false">
              <defs>
                <linearGradient id="super-steel" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#9fa69a" />
                  <stop offset="48%" stopColor="#3d4a4c" />
                  <stop offset="100%" stopColor="#171f25" />
                </linearGradient>
                <linearGradient id="super-gold" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#b49352" />
                  <stop offset="52%" stopColor="#665638" />
                  <stop offset="100%" stopColor="#2c271d" />
                </linearGradient>
                <linearGradient id="super-blue" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#2179d8" />
                  <stop offset="52%" stopColor="#0f3a76" />
                  <stop offset="100%" stopColor="#071b36" />
                </linearGradient>
                <radialGradient id="super-hammer-glow" cx="42%" cy="38%" r="72%">
                  <stop offset="0%" stopColor="#91efff" />
                  <stop offset="58%" stopColor="#27b8e5" />
                  <stop offset="100%" stopColor="#0b4b78" />
                </radialGradient>
              </defs>

              <g className="super-minion-model__rig">
                <g className="super-minion-model__legs">
                  <path d="M92 113 L78 151 L55 161 L71 123Z" fill="url(#super-steel)" />
                  <path d="M145 113 L165 151 L193 160 L173 122Z" fill="url(#super-steel)" />
                  <path d="M75 125 L101 117 L94 150 L66 157Z" fill="#202e34" opacity="0.78" />
                  <path d="M169 125 L139 117 L150 151 L183 157Z" fill="#202e34" opacity="0.78" />
                  <path d="M45 157 L100 148 L114 171 L40 174Z" fill="#111a20" />
                  <path d="M142 149 L199 157 L207 172 L133 173Z" fill="#111a20" />
                  <path d="M53 162 L96 154 M149 154 L197 162" stroke="#5d6a68" strokeLinecap="round" strokeWidth="3.5" opacity="0.56" />
                </g>

                <g className="super-minion-model__backplate">
                  <path d="M55 69 L100 28 L144 42 L128 98 L81 108Z" fill="#273941" />
                  <path d="M125 42 L174 29 L203 65 L180 113 L132 102Z" fill="#304247" />
                  <path d="M66 66 L101 42 L128 48 L116 86 L82 93Z" fill="#8d9588" opacity="0.58" />
                  <path d="M139 53 L170 44 L190 67 L172 98 L138 91Z" fill="#8d9588" opacity="0.5" />
                  <path d="M93 37 C111 17 141 18 159 39 L146 59 L107 58Z" fill="#092447" />
                  <path d="M103 39 C116 29 137 29 151 42" stroke="#38a2ff" strokeLinecap="round" strokeWidth="5" opacity="0.38" />
                  <path d="M54 70 L80 43 L95 76 L72 99Z" fill="#131d23" opacity="0.8" />
                  <path d="M182 49 L206 69 L183 101 L167 76Z" fill="#131d23" opacity="0.72" />
                </g>

                <g className="super-minion-model__hammer-arm">
                  <path d="M99 82 C75 77 55 87 37 106 L51 131 C69 116 88 110 108 112Z" fill="url(#super-steel)" />
                  <path d="M35 103 L62 116" stroke="#7e8b86" strokeLinecap="round" strokeWidth="10" />
                  <path d="M15 66 L70 83 L60 149 L3 134Z" fill="url(#super-gold)" />
                  <path className="super-minion-model__hammer-core" d="M13 82 L65 96 L55 136 L5 122Z" fill="url(#super-hammer-glow)" />
                  <path d="M13 82 L39 74 L65 96 L37 107Z" fill="#9bf4ff" opacity="0.78" />
                  <path d="M37 107 L65 96 L55 136 L34 124Z" fill="#1496cc" opacity="0.72" />
                  <path d="M15 66 L71 82 L80 72 L27 57Z" fill="#b29557" />
                  <path d="M58 98 L69 85 L60 148 L50 132Z" fill="#45391f" opacity="0.62" />
                  <path d="M8 85 L58 99" stroke="#bdf8ff" strokeLinecap="round" strokeWidth="2.5" opacity="0.62" />
                  <path d="M28 69 L22 131" stroke="#332a18" strokeLinecap="round" strokeWidth="3" opacity="0.38" />
                </g>

                <g className="super-minion-model__shield">
                  <path d="M151 35 L222 55 L232 133 L179 163 L139 121Z" fill="url(#super-gold)" />
                  <path d="M166 55 L211 68 L220 121 L181 147 L153 115Z" fill="url(#super-steel)" />
                  <path d="M178 69 L205 77 L210 109 L184 128 L166 102Z" fill="#a6ada1" opacity="0.46" />
                  <path d="M160 48 L221 65" stroke="#dfc170" strokeLinecap="round" strokeWidth="4.5" opacity="0.56" />
                  <path d="M179 163 L181 147 L220 121 L232 133Z" fill="#211c14" opacity="0.6" />
                  <path d="M148 121 L166 55" stroke="#c6a35e" strokeLinecap="round" strokeWidth="3" opacity="0.58" />
                  <path d="M194 68 L205 113" stroke="#121919" strokeLinecap="round" strokeWidth="3" opacity="0.4" />
                  <path d="M215 70 L221 120 L210 116 L204 78Z" fill="#11191c" opacity="0.5" />
                </g>

                <g className="super-minion-model__body">
                  <path className="super-minion-model__torso" d="M77 74 L123 55 L160 68 L178 111 L149 148 L101 148 L73 116Z" fill="url(#super-steel)" />
                  <path d="M93 86 L145 85 L160 115 L140 136 L107 137 L88 115Z" fill="#18272d" opacity="0.72" />
                  <path d="M105 101 L139 102 L148 128 L121 147 L94 128Z" fill="url(#super-blue)" opacity="0.84" />
                  <path d="M112 111 L132 111 L138 126 L121 138 L105 126Z" fill="#32a8ff" opacity="0.48" />
                  <path d="M113 145 L101 158 L140 158 L130 145Z" fill="#11191f" opacity="0.78" />
                  <path className="super-minion-model__shoulder super-minion-model__shoulder--left" d="M58 62 L101 42 L129 80 L94 110 L49 91Z" fill="url(#super-steel)" />
                  <path className="super-minion-model__shoulder super-minion-model__shoulder--right" d="M130 47 L171 59 L188 92 L145 113 L118 81Z" fill="url(#super-steel)" />
                  <path d="M71 68 L102 57 L117 81 L92 97Z" fill="#a5aa9f" opacity="0.42" />
                  <path d="M139 60 L164 68 L173 86 L145 100Z" fill="#a5aa9f" opacity="0.36" />
                  <path className="super-minion-model__hood" d="M103 45 C114 25 141 25 153 47 L143 73 L112 72Z" fill="url(#super-blue)" />
                  <path d="M113 38 C122 30 137 31 146 44 L140 50 L111 49Z" fill="#2e8be7" opacity="0.34" />
                  <path className="super-minion-model__mask" d="M113 53 L142 56 L138 70 L115 69Z" fill="#c8d8d7" />
                  <path d="M119 60 L126 62 M135 61 L130 64" stroke="#16242a" strokeLinecap="round" strokeWidth="3" />
                  <path d="M116 46 C124 37 136 38 143 49" stroke="#5aaef2" strokeLinecap="round" strokeWidth="3" opacity="0.26" />
                </g>
              </g>
            </svg>
          </div>
          <div className="nexus-hit-spark" />
          <div className="nexus-shockwave" />
        </div>
      </div>
      <div className="nexus-loader__copy">
        <span className="nexus-loader__title">Rift Daily</span>
      </div>
    </div>
  );
}
