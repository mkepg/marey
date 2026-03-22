export const KEYWORD_DOCS: Record<string, string> = {
  template: `### \`template\`\nDefines a reusable component template structure.\n\n**Example:**\n\`\`\`declare\ntemplate Star(color) {\n  group {\n    circle { radius: 10, color: color }\n  }\n}\n\`\`\``,
  use: `### \`use\`\nInstantiates a template into the scene.\n\n**Example:**\n\`\`\`declare\nuse Star(red) myStar {\n  position: (100, 100)\n  scale: 1.5\n}\n\`\`\``,
  generate: `### \`generate\`\nCreates a loop to generate multiple objects or groups. The loop variable can be used in math expressions inside the block to position or scale objects dynamically.\n\n**Example:**\n\`\`\`declare\ngenerate i from 1 to 5 {\n  circle dot {\n    position: (i * 50, 100)\n    radius: 10\n  }\n}\n\`\`\``,
  def: `### \`def\`\nDeclares a constant variable. Variables in Declare are strictly block-scoped and immutable.\n\n**Example:**\n\`\`\`declare\ndef spacing = 50\n\`\`\``,
  scene: `### \`scene\`\nThe root block of a Declare program. Contains all objects and global scene properties.\n\n**Required Property:** \`size\``
};

export const PROPERTY_DOCS: Record<string, string> = {
  position: `### \`position\`\nSets the \`(x, y)\` coordinates of the object in the scene.\n\n**Accepts:** \`point\`\n**Example:** \`position: (100, 200)\``,
  radius: `### \`radius\`\nSets the radius of a circle.\n\n**Accepts:** \`number\` (greater than 0)\n**Example:** \`radius: 50\``,
  size: `### \`size\`\nSets the width and height of a rectangle or the scene.\n\n**Accepts:** \`point\` (width, height)\n**Example:** \`size: (600, 400)\``,
  points: `### \`points\`\nDefines the vertices of a polygon or line.\n\n**Accepts:** \`pointList\`\n**Example:** \`points: [(0,0), (100,0), (50,100)]\``,
  thickness: `### \`thickness\`\nSets the stroke width in pixels for a line.\n\n**Accepts:** \`number\` (greater than 0)\n**Example:** \`thickness: 4\``,
  content: `### \`content\`\nThe text string to display.\n\n**Accepts:** \`string\`\n**Example:** \`content: "Hello World"\``,
  fontSize: `### \`fontSize\`\nThe size of the text font.\n\n**Accepts:** \`number\`\n**Example:** \`fontSize: 24\``,
  color: `### \`color\`\nThe fill color. Can be a named color or a hex code.\n\n**Accepts:** \`color\`\n**Example:** \`color: red\` or \`color: #ff0000\``,
  alpha: `### \`alpha\`\nTransparency level from \`0.0\` (invisible) to \`1.0\` (fully opaque).\n\n**Accepts:** \`number\`\n**Example:** \`alpha: 0.5\``,
  rotation: `### \`rotation\`\nRotation angle in degrees.\n\n**Accepts:** \`number\`\n**Example:** \`rotation: 45\``,
  scale: `### \`scale\`\nScales the object. Can be a uniform number or a point for independent X/Y scaling.\n\n**Accepts:** \`number\` or \`point\`\n**Example:** \`scale: 1.5\` or \`scale: (2, 0.5)\``,
  anchor: `### \`anchor\`\nThe origin point for rotation and positioning, mapped from \`0.0\` to \`1.0\`. \`(0.5, 0.5)\` is the exact geometric center.\n\n**Accepts:** \`point\`\n**Example:** \`anchor: (0.5, 0.5)\``,
  z: `### \`z\`\nZ-index for rendering order. Objects with higher \`z\` values are drawn on top.\n\n**Accepts:** \`number\`\n**Example:** \`z: 10\``,
  background: `### \`background\`\nThe background color of the scene.\n\n**Accepts:** \`color\`\n**Example:** \`background: #222222\``,
  sceneFit: `### \`sceneFit\`\nHow the scene scales to the preview window.\n\n**Accepts:** \`contain\`, \`cover\`, \`fill\`, or \`none\`\n**Example:** \`sceneFit: contain\``,
  property: `### \`property\`\nThe specific property targeted by the animation block.\n\n**Accepts:** \`position\`, \`rotation\`, \`scale\`, \`alpha\`\n**Example:** \`property: rotation\``,
  to: `### \`to\`\nThe target value for the animation.\n\n**Example:** \`to: 360\``,
  duration: `### \`duration\`\nHow long the animation runs in seconds.\n\n**Accepts:** \`number\`\n**Example:** \`duration: 2.5\``,
  easing: `### \`easing\`\nThe rate of change over time.\n\n**Accepts:** \`linear\`, \`easeIn\`, \`easeOut\`, \`easeInOut\`\n**Example:** \`easing: easeInOut\``,
  loop: `### \`loop\`\nWhether the animation repeats endlessly.\n\n**Accepts:** \`true\`, \`false\`\n**Example:** \`loop: true\``,
  yoyo: `### \`yoyo\`\nWhether the animation smoothly reverses back to its starting position at the end of its duration.\n\n**Accepts:** \`true\`, \`false\`\n**Example:** \`yoyo: true\``,
  handOff: `### \`handOff\`\nAllows an animation to seamlessly transfer its final momentum to the physics engine once completed. Requires a sibling \`physics\` block.\n\n**Accepts:** \`true\`, \`false\`\n**Example:** \`handOff: true\``,
  velocity: `### \`velocity\`\nThe initial momentum vector of the object in pixels per second.\n\n**Accepts:** \`point\`\n**Example:** \`velocity: (200, -500)\``,
  gravity: `### \`gravity\`\nThe continuous acceleration applied each frame. \`(0, 980)\` mimics real-world downward gravity.\n\n**Accepts:** \`point\`\n**Example:** \`gravity: (0, 980)\``,
  friction: `### \`friction\`\nThe frame-rate independent drag coefficient between \`0.0\` and \`1.0\`. \`1.0\` means no drag. \`0.999\` is nearly frictionless air.\n\n**Accepts:** \`number\`\n**Example:** \`friction: 0.999\``,
  bounce: `### \`bounce\`\nThe restitution coefficient when colliding with a boundary, mapping \`0.0\` (no bounce) to \`1.0\` (perfectly elastic).\n\n**Accepts:** \`number\`\n**Example:** \`bounce: 0.65\``,
  collideBounds: `### \`collideBounds\`\nDetermines whether the object bounces against the logical edges of the scene window.\n\n**Accepts:** \`true\`, \`false\`\n**Example:** \`collideBounds: true\``,
};

export const namedColors = ["red", "green", "blue", "white", "black", "yellow", "cyan", "magenta", "orange"];