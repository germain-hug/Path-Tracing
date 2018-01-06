function setup()
{
	UI = {};
	UI.tabs = [];
	UI.titleLong = 'Path Tracer';
	UI.titleShort = 'PathTracer';
	UI.numFrames = 1000;
	UI.maxFPS = 1000;
	UI.renderWidth = 256;
	UI.renderHeight = 128;

	UI.tabs.push(
		{
		visible: true,
		type: `x-shader/x-fragment`,
		title: `Raytracing`,
		id: `TraceFS`,
		initialValue: `/*
   ==========================
   ====== Coursework 3 ======
   ====   Hugo Germain   ====
   ==========================
*/

#define LIGHT
#define BOUNCE
#define THROUGHPUT
#define HALTON
#define IMPORTANCE_SAMPLING
#define AA

// Thanks to Iliyan Georgiev from Solid Angle for explaining proper housekeeping of sample dimensions in ranomdized Quasi-Monte Carlo

precision highp float;

#define M_PI 3.1415

struct Material {
  // ----------------- Question 1 ------------------
  // ----         Let there be light !          ----
  // -----------------------------------------------
 
  // We simply add an light emission channel 
  vec3 emission;
  vec3 diffuse;
  vec3 specular;
  float glossiness;
};

struct Sphere {
  vec3 position;
  float radius;
  Material material;
};

struct Plane {
  vec3 normal;
  float d;
  Material material;
};

const int sphereCount = 2;
const int planeCount = 2;
const int maxPathLength = 3;

struct Scene {
  Sphere[sphereCount] spheres;
  Plane[planeCount] planes;
};

struct Ray {
  vec3 origin;
  vec3 direction;
};

// Contains all information pertaining to a ray/object intersection
struct HitInfo {
  bool hit;
  float t;
  vec3 position;
  vec3 normal;
  Material material;
};

HitInfo getEmptyHit() {
  Material emptyMaterial;
  emptyMaterial.diffuse = vec3(0.0);
  emptyMaterial.specular = vec3(0.0);
  emptyMaterial.glossiness = 0.0;
  return HitInfo(false, 0.0, vec3(0.0), vec3(0.0), emptyMaterial);
}

HitInfo intersectSphere(Ray ray, Sphere sphere) {
    vec3 to_sphere = ray.origin - sphere.position;

    float a = dot(ray.direction, ray.direction);
    float b = 2.0 * dot(ray.direction, to_sphere);
    float c = dot(to_sphere, to_sphere) - sphere.radius * sphere.radius;
    float D = b * b - 4.0 * a * c;
    if (D > 0.0)
    {
		float t0 = (-b - sqrt(D)) / (2.0 * a);
		float t1 = (-b + sqrt(D)) / (2.0 * a);
      	float t = min(t0, t1);
      	vec3 hitPosition = ray.origin + t * ray.direction;
        return HitInfo(
          	true,
          	t,
          	hitPosition,
          	normalize(hitPosition - sphere.position),
          	sphere.material);
    }
    return getEmptyHit();
}

HitInfo intersectPlane(Ray ray, Plane plane) {
  float t = -(dot(ray.origin, plane.normal) + plane.d) / dot(ray.direction, plane.normal);
  vec3 hitPosition = ray.origin + t * ray.direction;
  return HitInfo(
	true,
	t,
	hitPosition,
	normalize(plane.normal),
	plane.material); 
    return getEmptyHit();
}

float lengthSquared(vec3 x) {
  return dot(x, x);
}

HitInfo intersectScene(Scene scene, Ray ray, float tMin, float tMax)
{
    HitInfo best_hit_info;
    best_hit_info.t = tMax;
  	best_hit_info.hit = false;

    for (int i = 0; i < planeCount; ++i) {
        Plane plane = scene.planes[i];
        HitInfo hit_info = intersectPlane(ray, plane);

        if(	hit_info.hit && 
           	hit_info.t < best_hit_info.t &&
           	hit_info.t > tMin)
        {
            best_hit_info = hit_info;
        }
    }

    for (int i = 0; i < sphereCount; ++i) {
        Sphere sphere = scene.spheres[i];
        HitInfo hit_info = intersectSphere(ray, sphere);

        if(	hit_info.hit && 
           	hit_info.t < best_hit_info.t &&
           	hit_info.t > tMin)
        {
            best_hit_info = hit_info;
        }
    }
  
  return best_hit_info;
}

// Converts a random integer in 15 bits to a float in (0, 1)
float randomIntegerToRandomFloat(int i) {
	return float(i) / 32768.0;
}

// Returns a random integer for every pixel and dimension that remains the same in all iterations
int pixelIntegerSeed(int dimensionIndex) {
  vec3 p = vec3(gl_FragCoord.xy, dimensionIndex);
  vec3 r = vec3(23.14069263277926, 2.665144142690225,7.358926345 );
  return int(32768.0 * fract(cos(dot(p,r)) * 123456.0));  
}

// Returns a random float for every pixel that remains the same in all iterations
float pixelSeed(int dimensionIndex) {
  	return randomIntegerToRandomFloat(pixelIntegerSeed(dimensionIndex));
}

// The global random seed of this iteration
// It will be set to a new random value in each step
uniform int globalSeed;
int randomSeed;
void initRandomSequence() {
  randomSeed = globalSeed + pixelIntegerSeed(0);
}

// Computes integer x modulo y, not available in most WEBGL SL implementations
int mod(int x, int y) {
  return int(float(x) - floor(float(x) / float(y)) * float(y));
}

// Returns the next integer in a pseudo-random sequence
int rand() {
  	randomSeed = randomSeed * 1103515245 + 12345;   
	return mod(randomSeed / 65536, 32768);
}

// Returns the next float in this pixels pseudo-random sequence
float uniformRandom() {
	return randomIntegerToRandomFloat(rand());
}

// Returns the ith prime number for the first 20 
const int maxDimensionCount = 10;
int prime(int index) {
  if(index == 0) return 2;
  if(index == 1) return 3;
  if(index == 2) return 5;
  if(index == 3) return 7;
  if(index == 4) return 11;
  if(index == 5) return 13;
  if(index == 6) return 17;
  if(index == 7) return 19;
  if(index == 8) return 23;
  if(index == 9) return 29;
  if(index == 10) return 31;
  if(index == 11) return 37;
  if(index == 12) return 41;
  if(index == 13) return 43;
  if(index == 14) return 47;
  if(index == 15) return 53;
  return 2;
}

float halton(int sampleIndex, int dimensionIndex) {
#ifdef HALTON  
  // ----------------- Question 4 ------------------
  // ---- Variance reduction: Sampling patterns ----
  // -----------------------------------------------
  
  
  // We base our code on the Wikipedia Pseudo-code :
  // https://en.wikipedia.org/wiki/Halton_sequence
  
  float f = 1.0;
  float b = float(prime(dimensionIndex));
  float i = float(sampleIndex);
  float result = 0.0;
  
  for(int j = 0 ;  j < 10 ; j++){
    f = f / float(b);
    result = result + f*float(mod(int(i),int(b)));
    i = floor(i/b);
  }
  
  return result;
  
#else
  return 0.0;
#endif
}

// This is the index of the sample controlled by the framework.
// It increments by one in every call of this shader
uniform int baseSampleIndex;

// Returns a well-distributed number in (0,1) for the dimension dimensionIndex
float sample(int dimensionIndex) {
#ifdef HALTON  
  float h = halton(baseSampleIndex,dimensionIndex);
  float random = fract(h+pixelSeed(dimensionIndex));
  return random;
#else
  // Replace the line below to use the Halton sequence for variance reduction
  return uniformRandom();
#endif  
}

// This is a helper function to sample two-dimensionaly in dimension dimensionIndex
vec2 sample2(int dimensionIndex) {
  return vec2(sample(dimensionIndex + 0), sample(dimensionIndex + 1));
}

// This is a register of all dimensions that we will want to sample.
//
// So if we want to use lens sampling, we call sample(LENS_SAMPLE_DIMENSION).
//
// There are infinitely many path sampling dimensions.
// These start at PATH_SAMPLE_DIMENSION.
// The 2D sample pair for vertex i is at PATH_SAMPLE_DIMENSION + 2 * i + 0
#define ANTI_ALIAS_SAMPLE_DIMENSION 0
#define LENS_SAMPLE_DIMENSION 2
#define PATH_SAMPLE_DIMENSION 4

vec3 randomDirection(int dimensionIndex) {
#ifdef BOUNCE
  // Put your code to compute a random direction in 3D here
  
  // ----------------- Question 2 ------------------
  // ----              Now bounce               ----
  // -----------------------------------------------
 
  // We follow the implementation indicated in the statement :
  float xi_0 = sample(dimensionIndex);
  float xi_1 = sample(dimensionIndex+1);
  float theta = acos(2.0*xi_0-1.0);
  float phi = xi_1*2.0*M_PI;
  float x = sin(theta)*cos(phi);
  float y = sin(theta)*sin(phi);
  float z = cos(theta);
  return vec3(x,y,z);
#else
  return vec3(0);
#endif
}

vec3 getEmission(Material material) {
#ifdef LIGHT  
    // Put your code here
  	return material.emission;
#else
  	// This is wrong. It just returns the diffuse color so that you see something to be sure it is working.
  	return material.diffuse;
#endif
}

 // ----------------- Question 3 ------------------
 // ----              Throughput               ----
 // -----------------------------------------------
  
vec3 getReflectance(
  Material material,
  vec3 normal,
  vec3 inDirection,
  vec3 outDirection)
{
#ifdef THROUGHPUT    
    // Put your code here

  	// First, we compute the reflectance as follows :
    vec3 ks = material.specular;
  	float m = material.glossiness;
  	vec3 i = normalize(inDirection);
  	vec3 o = normalize(outDirection);
  	vec3 n = normalize(normal);
  	float factor = pow(max(0.0,dot(o,reflect(i,n))),m);
  	return ks*(2.0+m)*factor/(2.0*M_PI);
#else
  return vec3(1.0);
#endif 
}

vec3 getGeometricTerm(
  Material material,
  vec3 normal,
  vec3 inDirection,
  vec3 outDirection)
{
#ifdef THROUGHPUT  
    // The geometric term is simply the 'cos(theta)' term in 
  	// the rendering equation :
  
  	vec3 n = normalize(normal);
  	vec3 o = normalize(outDirection);
  	return max(vec3(0.0),vec3(dot(n,o)));
#else
  	return vec3(1.0);
#endif 
}

vec3 samplePath(Scene scene, Ray initialRay) {
  
  // Initial result is black
  vec3 result = vec3(0);
  
  Ray incomingRay = initialRay;
  vec3 throughput = vec3(1.0);
  
  for(int i = 0; i < maxPathLength; i++) {
    HitInfo hitInfo = intersectScene(scene, incomingRay, 0.001, 10000.0);  

    if(!hitInfo.hit) return result;
	// We use the throughput to weight the emission 
    result += throughput * getEmission(hitInfo.material);
	
    Ray outgoingRay;

#ifdef BOUNCE
   // Put your code to compute the next ray here
    outgoingRay.origin = hitInfo.position;
    outgoingRay.direction = randomDirection(PATH_SAMPLE_DIMENSION + 2*i);
#endif    
    
    float probability = 1.0/M_PI;
#ifdef IMPORTANCE_SAMPLING
    // ----------------- Question 5 ------------------
    // ----         Importance Sampling           ----
    // -----------------------------------------------
    
    // We make sure the bouncing ray goes in the positive
    // half-space, that is the one defined by the normal:
    
    if(dot(outgoingRay.direction , hitInfo.normal) < 0.0){
      outgoingRay.direction = - outgoingRay.direction;
  	} 
    // We divided the range of directions by two, hence:
    probability = probability * 2.0; 
#endif

#ifdef THROUGHPUT    
    // Do proper throughput computation here
    
    // We compute the throughput based on the rendering
    // equation described :
    vec3 reflectance = getReflectance(hitInfo.material,hitInfo.normal,incomingRay.direction,outgoingRay.direction);
    vec3 geometric = getGeometricTerm(hitInfo.material,hitInfo.normal,incomingRay.direction,outgoingRay.direction);
    vec3 diffuse = hitInfo.material.diffuse;
    throughput *= (reflectance+diffuse/M_PI)*geometric;
#else
    throughput *= 0.1;    
#endif
    
    throughput /= probability;
    
#ifdef BOUNCE
    // Put some handling of the next and the current ray here
    // We simply define the outgoing ray as the next incoming ray:
    incomingRay = outgoingRay;
#endif    
  }  
  return result;
}

uniform ivec2 resolution;
Ray getFragCoordRay(vec2 fragCoord) {
  
  	float sensorDistance = 1.0;
  	vec3 origin = vec3(0, 0, sensorDistance);
  	vec2 sensorMin = vec2(-1, -0.5);
  	vec2 sensorMax = vec2(1, 0.5);
  	vec2 pixelSize = (sensorMax - sensorMin) / vec2(resolution);
    vec3 direction = normalize(vec3(sensorMin + pixelSize * fragCoord, -sensorDistance));
  
  	float apertureSize = 0.0;
  	float focalPlane = 100.0;
  	vec3 sensorPosition = origin + focalPlane * direction;  
  	origin.xy += apertureSize * (sample2(LENS_SAMPLE_DIMENSION) - vec2(0.5));  
  	direction = normalize(sensorPosition - origin);
  
  	return Ray(origin, direction);
}

vec3 colorForFragment(Scene scene, vec2 fragCoord) {      
  	initRandomSequence(); 

#ifdef AA  
    // ----------------- Question 6 ------------------
    // ----            Anti-Aliasing              ----
    // -----------------------------------------------
    
  	// We are going to compute an average path based on slightly noisy
    // fragCoord values. Here we take three random samples:
  	vec3 avg_path = vec3(0.0);
  	const int nb_iter = 3;
     
  	for(int i = 0; i < nb_iter; i++) {
     vec2 randvec2 = vec2(uniformRandom(),uniformRandom());
     avg_path = avg_path + samplePath(scene, getFragCoordRay(fragCoord+randvec2));
    }
  	return avg_path/vec3(nb_iter);
#else
    return samplePath(scene, getFragCoordRay(fragCoord));
#endif

}

void loadScene1(inout Scene scene) {
  scene.spheres[0].position = vec3(1, -2, -12);
  scene.spheres[0].radius = 3.0;

  scene.spheres[0].material.diffuse = vec3(0.9, 0.1, 0.2);
  scene.spheres[0].material.specular = vec3(1.0);
  scene.spheres[0].material.glossiness = 10.0;  
  scene.spheres[0].material.emission = vec3(0.0);

  scene.spheres[1].position = vec3(-8, -2, -12);
  scene.spheres[1].radius = 3.0;

  scene.spheres[1].material.diffuse = vec3(0.0);
  scene.spheres[1].material.specular = vec3(0.0);
  scene.spheres[1].material.glossiness = 10.0;
  scene.spheres[1].material.emission = 30.0*vec3(0.9, 0.8, 0.5);

  scene.planes[0].normal = vec3(0, 1, 0);
  scene.planes[0].d = 4.5;

  scene.planes[0].material.diffuse = vec3(0.8);
  scene.planes[0].material.specular = vec3(0);
  scene.planes[0].material.glossiness = 50.0;    
  scene.planes[0].material.emission = vec3(0.0);

  scene.planes[1].normal = vec3(0, 0, 1);
  scene.planes[1].d = 18.5;

  scene.planes[1].material.diffuse = vec3(0.5, 0.8, 0.2);
  scene.planes[1].material.specular = vec3(0.0);
  scene.planes[1].material.glossiness = 5.0;
  scene.planes[1].material.emission = vec3(0.0);

}

void loadScene2(inout Scene scene) {
    scene.spheres[0].position = vec3(1, -2, -12);
    scene.spheres[0].radius = 3.0;
    scene.spheres[0].material = 
      Material(vec3(0.0), vec3(0.9, 0.1, 0.2), vec3(1.0), 10.0);

    scene.spheres[1].position = vec3(-8, -2, -10);
    scene.spheres[1].radius = 2.0;
    scene.spheres[1].material = 
      Material(vec3(0), vec3(0.8, 0.9, 0.2), vec3(1.0), 10.0);

    scene.planes[0].normal = vec3(0, 1, 0);
  	scene.planes[0].d = 4.5;
    scene.planes[0].material = 
      Material(vec3(0.0), vec3(0.8, 0.5, 0.2), vec3(1.0), 50.0);

    scene.planes[1].normal = vec3(1, -1, 1);
  	scene.planes[1].d = 80.0;
    scene.planes[1].material = 
      Material(vec3(2.0), vec3(0.5, 0.8, 0.2), vec3(0.0), 5.0);  
}

void loadScene3(inout Scene scene) {
    scene.spheres[0].position = vec3(1, -2, -12);
    scene.spheres[0].radius = 3.0;
    scene.spheres[0].material.emission =vec3(0.0);
  	scene.spheres[0].material.diffuse = vec3(0.9, 0.9, 0.2);
  	scene.spheres[0].material.specular = vec3(1.0);
  	scene.spheres[0].material.glossiness = 20.0;

    scene.spheres[1].position = vec3(-4, -1, -6);
    scene.spheres[1].radius = 3.0;
    scene.spheres[1].material.emission =vec3(0.0);
  	scene.spheres[1].material.diffuse = vec3(0.2, 0.9, 0.9);
  	scene.spheres[1].material.specular = vec3(1.0);
  	scene.spheres[1].material.glossiness = 20.0;

    scene.planes[0].normal = vec3(0, 1, 0);
  	scene.planes[0].d = 4.5;
    scene.planes[0].material.emission =vec3(0.0);
  	scene.planes[0].material.diffuse = vec3(0.8, 0.5, 0.2);
  	scene.planes[0].material.specular = vec3(1.0);
  	scene.planes[0].material.glossiness = 50.0;

    scene.planes[1].normal = vec3(1, -1, 1);
  	scene.planes[1].d = 80.0;
 	scene.planes[1].material.emission =vec3(2.0);
  	scene.planes[1].material.diffuse = vec3(0.5, 0.8, 0.2);
  	scene.planes[1].material.specular = vec3(0.0);
}


void main() {
  // Setup scene
  Scene scene;
  loadScene1(scene);

  // compute color for fragment
  gl_FragColor.rgb = colorForFragment(scene, gl_FragCoord.xy);
  gl_FragColor.a = 1.0;
}
`,
		description: ``,
		wrapFunctionStart: ``,
		wrapFunctionEnd: ``
	});

	UI.tabs.push(
		{
		visible: true,
		type: `x-shader/x-fragment`,
		title: `Tonemapping`,
		id: `CopyFS`,
		initialValue: `precision highp float;

uniform sampler2D radianceTexture;
uniform int sampleCount;
uniform ivec2 resolution;

vec3 tonemap(vec3 color, float maxLuminance, float gamma) {
	float luminance = color.g;
	//float scale =  luminance /  maxLuminance;
	float scale = 1.0;//luminance / (maxLuminance * luminance + 0.001);
  	return max(vec3(0.0), pow(scale * color, vec3(1.0 / gamma)));
}

void main(void) {
  vec3 texel = texture2D(radianceTexture, gl_FragCoord.xy / vec2(resolution)).rgb;
  vec3 radiance = texel / float(sampleCount);
  gl_FragColor.rgb = tonemap(radiance, 0.2, 2.2);
  gl_FragColor.a = 1.0;
}
`,
		description: ``,
		wrapFunctionStart: ``,
		wrapFunctionEnd: ``
	});

	UI.tabs.push(
		{
		visible: false,
		type: `x-shader/x-vertex`,
		title: ``,
		id: `VS`,
		initialValue: `
	attribute vec3 position;
	void main(void) {
		gl_Position = vec4(position, 1.0);
	}
`,
		description: ``,
		wrapFunctionStart: ``,
		wrapFunctionEnd: ``
	});

	 return UI; 
}//!setup


function getShader(gl, id) {

		gl.getExtension('OES_texture_float');
		//alert(gl.getSupportedExtensions());

	var shaderScript = document.getElementById(id);
	if (!shaderScript) {
		return null;
	}

	var str = "";
	var k = shaderScript.firstChild;
	while (k) {
		if (k.nodeType == 3) {
			str += k.textContent;
		}
		k = k.nextSibling;
	}

	var shader;
	if (shaderScript.type == "x-shader/x-fragment") {
		shader = gl.createShader(gl.FRAGMENT_SHADER);
	} else if (shaderScript.type == "x-shader/x-vertex") {
		shader = gl.createShader(gl.VERTEX_SHADER);
	} else {
		return null;
	}

	gl.shaderSource(shader, str);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		alert(gl.getShaderInfoLog(shader));
		return null;
	}

	return shader;
}

function RaytracingDemo() {
}

function initShaders() {

	traceProgram = gl.createProgram();
	gl.attachShader(traceProgram, getShader(gl, "VS"));
	gl.attachShader(traceProgram, getShader(gl, "TraceFS"));
	gl.linkProgram(traceProgram);
	gl.useProgram(traceProgram);
	traceProgram.vertexPositionAttribute = gl.getAttribLocation(traceProgram, "position");
	gl.enableVertexAttribArray(traceProgram.vertexPositionAttribute);

	copyProgram = gl.createProgram();
	gl.attachShader(copyProgram, getShader(gl, "VS"));
	gl.attachShader(copyProgram, getShader(gl, "CopyFS"));
	gl.linkProgram(copyProgram);
	gl.useProgram(copyProgram);
	traceProgram.vertexPositionAttribute = gl.getAttribLocation(copyProgram, "position");
	gl.enableVertexAttribArray(copyProgram.vertexPositionAttribute);

}

function initBuffers() {
	triangleVertexPositionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, triangleVertexPositionBuffer);
	
	var vertices = [
		 -1,  -1,  0,
		 -1,  1,  0,
		 1,  1,  0,

		 -1,  -1,  0,
		 1,  -1,  0,
		 1,  1,  0,
	 ];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
	triangleVertexPositionBuffer.itemSize = 3;
	triangleVertexPositionBuffer.numItems = 3 * 2;
}


function tick() {
	
// 1st pass: Trace
	gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
 
	gl.useProgram(traceProgram);
  	gl.uniform1i(gl.getUniformLocation(traceProgram, "globalSeed"), Math.random() * 32768.0);
	gl.uniform1i(gl.getUniformLocation(traceProgram, "baseSampleIndex"), getCurrentFrame()); 	
	gl.uniform2i(
		gl.getUniformLocation(traceProgram, "resolution"), 
		getRenderTargetWidth(), 
		getRenderTargetHeight());
		
	gl.bindBuffer(gl.ARRAY_BUFFER, triangleVertexPositionBuffer);
	gl.vertexAttribPointer(
		traceProgram.vertexPositionAttribute, 
		triangleVertexPositionBuffer.itemSize, 
		gl.FLOAT, 
		false, 
		0,
		0);
	
    	gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    
	gl.disable(gl.DEPTH_TEST);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE);

	gl.drawArrays(gl.TRIANGLES, 0, triangleVertexPositionBuffer.numItems);

// 2nd pass: Average
   	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

	gl.useProgram(copyProgram);
	gl.uniform1i(gl.getUniformLocation(copyProgram, "sampleCount"), getCurrentFrame() + 1); 
  		
	gl.bindBuffer(gl.ARRAY_BUFFER, triangleVertexPositionBuffer);
	gl.vertexAttribPointer(
		copyProgram.vertexPositionAttribute, 
		triangleVertexPositionBuffer.itemSize, 
		gl.FLOAT, 
		false, 
		0,
		0);
	
    	gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    
	gl.disable(gl.DEPTH_TEST);
	gl.disable(gl.BLEND);

	gl.activeTexture(gl.TEXTURE0);
    	gl.bindTexture(gl.TEXTURE_2D, rttTexture);
	gl.uniform1i(gl.getUniformLocation(copyProgram, "radianceTexture"), 0);
	gl.uniform2i(
		gl.getUniformLocation(copyProgram, "resolution"), 
		getRenderTargetWidth(), 
		getRenderTargetHeight());
	
	gl.drawArrays(gl.TRIANGLES, 0, triangleVertexPositionBuffer.numItems);

	gl.bindTexture(gl.TEXTURE_2D, null);
}

function init() {	
	initShaders();
	initBuffers();
	gl.clear(gl.COLOR_BUFFER_BIT);	

	rttFramebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
	
	rttTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, rttTexture);
    	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, getRenderTargetWidth(), getRenderTargetHeight(), 0, gl.RGBA, gl.FLOAT, null);  
    	
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rttTexture, 0);
	gl.clear(gl.COLOR_BUFFER_BIT);	
}

var oldWidth = 0;
var oldTraceProgram;
var oldCopyProgram;
function compute(canvas) {
	
	if(	getRenderTargetWidth() != oldWidth || 
		oldTraceProgram != document.getElementById("TraceFS") ||
		oldCopyProgram !=  document.getElementById("CopyFS"))
	{
		init();
					
		oldWidth = getRenderTargetWidth();
		oldTraceProgram = document.getElementById("TraceFS");
		oldCopyProgram = document.getElementById("CopyFS");	
	}

	tick();
}
