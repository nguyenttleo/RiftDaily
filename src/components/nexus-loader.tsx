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
            </div>
          </div>
        </div>

        <div className="nexus-scene">
          <div className="nexus-respawn-ring" />
          <div className="nexus-platform">
            <span className="nexus-platform__rune nexus-platform__rune--left" />
            <span className="nexus-platform__rune nexus-platform__rune--right" />
          </div>
          <div className="nexus-pillar nexus-pillar--left" />
          <div className="nexus-pillar nexus-pillar--right" />
          <div className="nexus-core">
            <span className="nexus-core__aura" />
            <span className="nexus-core__crystal" />
            <span className="nexus-core__facet nexus-core__facet--left" />
            <span className="nexus-core__facet nexus-core__facet--right" />
          </div>
          <div className="nexus-shockwave" />
        </div>
      </div>
      <div className="nexus-loader__copy">
        <span className="nexus-loader__title">Rift Daily</span>
      </div>
    </div>
  );
}
