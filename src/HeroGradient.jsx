// Animated 3D gradient behind the home page header (shadergradient, built on react-three-fiber).
// Kept in its own file so three.js only downloads on the home page, and only when motion is welcome.
import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react'

export default function HeroGradient() {
  return (
    // Drawn a little larger than the header area so the wave's edges stay off-screen.
    <ShaderGradientCanvas className="hero-canvas" style={{ position: 'absolute', top: '-12%', left: '-12%', width: '124%', height: '124%' }}
      pointerEvents="none" pixelDensity={1} fov={45} lazyLoad>
      {/* Based on the library's "mint" preset, recoloured to the brand's pale green and amber.
          Colours stay light so the dark header text keeps AAA contrast; '3d' lighting needs no downloads. */}
      <ShaderGradient control="props" type="waterPlane" animate="on"
        uSpeed={0.15} uStrength={2.2} uDensity={1.2} uFrequency={0} uAmplitude={0}
        color1="#d4ecdd" color2="#fde7c2" color3="#f7f5f0"
        lightType="3d" brightness={1.4} grain="off" reflection={0.1}
        cAzimuthAngle={170} cPolarAngle={70} cDistance={4.4} cameraZoom={1}
        positionX={0} positionY={0.9} positionZ={-0.3} rotationX={45} rotationY={0} rotationZ={0} />
    </ShaderGradientCanvas>
  )
}
