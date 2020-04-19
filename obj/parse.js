﻿// parseObj
// ========
//
// This function is a minimal OBJ/MTL file loader, parser and interpreter for WebGL.
// It takes an OBJ file path as parameter and returns a hierarchy of objects and groups:
// obj = [{name: '...', groups: [{name: '...', v, vn, vt, vrgb, s, Ka, Kd, Ks, Ns, d, map_Ka, map_Kd, map_Ks}]}].
// Each group contains all the vertex buffers required by WebGL to render it: v (x, y, z), vt (u, v), vn (nx, ny, nz), vrgb (r, g, b).
// Extra information is added in each group: smoothness, ambient / diffuse / specular colors & textures, shininess, transparency, and illumination mode.
// If face normals are not present in the OBJ file, they're computed per face (not smoothed for each vertex) and put in the normals buffer.
// All the polygons with 4 faces or more are converted in 2 or more consecutive triangles.
// The object is centered on the origin by default but it can be disabled with center = 0.
parseOBJ = async (objpath, center = 1) => {
  
  // Temp vars
  var
  v = [],         // all the vertices
  vt = [],        // all the texture coordinates
  vn = [],        // all the normals
  vi = [],        // vertex indices for current group
  vti = [],       // texture coordinates indices for current group
  vni = [],       // normals indices for current group
  mtl = [],       // materials 
  currentvn = [], // current group normals
  obj = [],       // output
  currentobj = {groups: []},
  currentgroup = {},
  currentmtl = {},
  currents = 1,
  currentusemtl,
  objfolder,
  mtlfolder,
  objlines,
  mtllines,
  objline,
  mtlline,
  objcommand,
  mtlcommand,
  objparam,
  mtlparam,
  objlist,
  mtllist,
  normal,
  file,
  tmp, i, j,
  A, B, C,
  AB, BC,
  
  // This function is called when a group is complete
  // It computes the normals if necessary, and generates the final buffers (v, vt, vn, rgb) from the indices arrays (vi, vti, vni)
  // The group is then added to the current object and a new one is created
  endGroup = x => {
    
    // Copy material in group
    if(currentusemtl){
      var tmp = mtl.find(x => x.name == currentusemtl);
      currentgroup.Ka = tmp.Ka || [0, 0, 0];
      currentgroup.Kd = tmp.Kd || [0, 0, 0];
      currentgroup.Ks = tmp.Ks || [0, 0, 0];
      currentgroup.Ns = tmp.Ns || 0;
      currentgroup.d = tmp.d || 1;
      currentgroup.illum = tmp.illum || 1;
      currentgroup.map_Ka = tmp.map_Ka || '';
      currentgroup.map_Kd = tmp.map_Kd || '';
      currentgroup.map_Ks = tmp.map_Ks || '';
    }
    
    currentgroup.v = [];
    currentgroup.vt = [];
    currentgroup.vn = [];
    currentgroup.rgb = [];
    currentvn = [];

    // For every vertex triplet
    for(i = 0; i < vi.length; i += 3){
      
      // Retrieve vertices
      A = v[vi[i+0]];
      B = v[vi[i+1]];
      C = v[vi[i+2]];
      
      // Fill vertices buffer, offsetted to place the first vertex at 0,0,0 is center is set
      currentgroup.v.push(A[0] - (center ? v[vi[0]][0] : 0), A[1] - (center ? v[vi[0]][1] : 0), A[2] - (center ? v[vi[0]][2] : 0));
      currentgroup.v.push(B[0] - (center ? v[vi[0]][0] : 0), B[1] - (center ? v[vi[0]][1] : 0), B[2] - (center ? v[vi[0]][2] : 0));
      currentgroup.v.push(C[0] - (center ? v[vi[0]][0] : 0), C[1] - (center ? v[vi[0]][1] : 0), C[2] - (center ? v[vi[0]][2] : 0));
      
      // Fill rgb buffer if vertices include colors directly in the obj file
      if(A.length > 5){
        currentgroup.rgb.push(...A.splice(-3));
      }
      if(B.length > 5){
        currentgroup.rgb.push(...B.splice(-3));
      }
      if(C.length > 5){
        currentgroup.rgb.push(...C.splice(-3));
      }
      
      // Fill textures coordinates buffer (if applicable) 
      if(vti.length){
        currentgroup.vt.push(...vt[vti[i+0]]);
        currentgroup.vt.push(...vt[vti[i+1]]);
        currentgroup.vt.push(...vt[vti[i+2]]);
      }
      
      // Fill normal buffer (copy the normals if they are present in the obj file)
      if(vni.length){
        currentgroup.vn.push(...vn[vni[i+0]]);
        currentgroup.vn.push(...vn[vni[i+1]]);
        currentgroup.vn.push(...vn[vni[i+2]]);
      }
      
      // Compute normals if they're not present
      else {
        
        // Create vectors from 2 edges of the current face
        AB = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        BC = [C[0] - B[0], C[1] - B[1], C[2] - B[2]];
        
        // Compute face normal (cross product of AB and BC)
        // By default, A, B, C are in counter-clockwise order so the cross product points outside
        normal = [
          AB[1] * BC[2] - AB[2] * BC[1],
          AB[2] * BC[0] - AB[0] * BC[2],
          AB[0] * BC[1] - AB[1] * BC[0]
        ];
        
        // If smooth shading is on: each vertex normal is equal to the sum of the face normals that contain it
        if(currents){
          
          for(j = 0; j < 3; j++){
            if(!currentvn[vi[i+j]]){
              currentvn[vi[i+j]] = [0,0,0];
            }

            currentvn[vi[i+j]][0] += normal[0];
            currentvn[vi[i+j]][1] += normal[1];
            currentvn[vi[i+j]][2] += normal[2];
          }
        }
        
        // If smoothness is off: each vertex normal equals the face normal
        else {
          currentgroup.vn.push(...normal);
          currentgroup.vn.push(...normal);
          currentgroup.vn.push(...normal);
        }
      }
    }
    
    // Smooth shading enabled: finish copying the computed normals
    if(currents){
      for(i = 0; i < vi.length; i += 3){        
        currentgroup.vn.push(...currentvn[vi[i+0]]);
        currentgroup.vn.push(...currentvn[vi[i+1]]);
        currentgroup.vn.push(...currentvn[vi[i+2]]);
      }
    }
    
    // Save group smoothness
    currentgroup.s = currents;
    
    // Add group in current object
    currentobj.groups.push(currentgroup);
    
    // Reset group
    currentgroup = {};
    
    // Reset indices arrays
    vi = [];
    vti = [];
    vni = [];
  };
  
  // Isolate OBJ file's folder
  objfolder = /.*\//.exec(objpath) || '';
  
  // Request OBJ file, remove comments and split lines
  file = await(await fetch(objpath)).text();
  //console.log(file);
  objlines = file.replace(/#.*\n*/g,'').split(/[\r\n]+/);
    
  // For each line
  for(objline of objlines){
    
    // Separate command and param(s)
    [objcommand, objparam] = objline.split(/ (.*)/);
    
    // Split params as a list if possible
    if(objparam){
      objlist = objparam.split(/ +/);
    }
    
    // Interpret each command
    switch(objcommand){
      
      // Load MTL file
      case 'mtllib':
      
        // Isolate MTL file's folder (relative to OBJ folder)
        mtlfolder = /.*\//.exec(objfolder + objparam) || '';
        
        // Request MTL file, remove comments and split lines
        file = await(await fetch(objfolder + objparam)).text();
        mtllines = file.replace(/#.*\n*/g,'').split(/[\r\n]+/);
        console.log(file);
          
        // For each line
        for(mtlline of mtllines){
          
          // Separate command and param(s)
          [mtlcommand, mtlparam] = mtlline.split(/ (.*)/);
          
          // Split params as a list if possible
          if(mtlparam){
            mtllist = mtlparam.split(/ +/);
          }
          
          // Interpret each line
          switch(mtlcommand){
            
            // New material
            case 'newmtl':
              
              // Save current material and create a new one (if it's not empty)
              if(Object.keys(currentmtl).length){
                mtl.push(currentmtl);
                currentmtl = {};
              }
              
              // Save material name
              currentmtl.name = mtlparam;
              break;
              
            // Ambient/diffuse/specular color
            case 'Ka':
            case 'Kd':
            case 'Ks':
            
              // Save the r, g, b values as a float array
              currentmtl[mtlcommand] = mtllist.map(x => +x);
              break;
              
            // Shininess, illumination mode, diffuseness
            case 'Ns':
            case 'illum':
            case 'd':
              
              // Save the value as a float
              currentmtl[mtlcommand] +mtlparam;
              break;
              
            // Transparency
            case 'tr':
            
              // Save the opposite in d
              currentmt.d = 1 - +mtlparam;
              break;
              
            // Ambient/diffuse/specular texture map
            case 'map_Ka':
            case 'map_Kd':
            case 'map_Ks':
            
              // Save the value as a string (path relative to the MTL file)
              currentmtl[mtlcommand] = mtlfolder + mtlparam;
              break;
          }
        }
        
        // Push the last material in mtl
        mtl.push(currentmtl);
        
        break;
      
      // Use a material for the following groups
      case 'usemtl':
      
        // If the current group is not empty and already has a material different than this one, save it and create a new one
        if(vi.length && currentgroup.usemtl != objparam){
          endGroup();
        }
        
        // Save the material name for the current and next groups
        currentusemtl = objparam;
        
        break;
      
      // New object
      case 'o':
      
        // Save current group and current object and create new ones (if current object is not empty)
        if(currentobj.groups.length){
          endGroup();
          obj.push(currentobj);
          currentobj = {};
        }
        
        // Save current object's name
        currentobj.name = objparam;
        
        // Initialize groups
        currentobj.groups = [];
        
        // Reset smoothness to 1
        currents = 1;
        
        break;
        
      // New group
      case 'g':
      
        // Save current group and create a new one (if it's not empty)
        if(vi.length){
          endGroup()
        }
        
        // Save current group's name
        currentgroup.name = objparam;
        
        // Reset smoothness to 1
        currents = 1;
        
        break;
        
      // New vertex
      case 'v':
        
        // Push an array of 3 to 7 floats into v
        tmp = [];
        objlist.map((x, y) => tmp.push(+x));
        v.push(tmp);
        break;
        
      // New vertex texture coordinates
      case 'vt':
      
        // Push an array of 2 to 3 floats into vt
        tmp = [];
        objlist.map((x, y) => tmp.push(+x));
        vt.push(tmp);
        break;
        
      // New vertex normals
      case 'vn':
      
        // Push an array of 3 floats into vn
        tmp = [];
        objlist.map((x, y) => tmp.push(+x));
        vn.push(tmp);
        break;
      
      // New face (polygon)
      // Polygons with 4 (or more) faces are converted into 2 (or more) consecutive triangles
      case 'f':
      
        // For all possible triangles (1 or more)
        for(i = 1; i < objlist.length - 1; i++){
          
          // Consider the current triangle
          tmp = [objlist[0], objlist[i], objlist[i+1]];
          
          // For each summit of the triangle
          tmp.map(x => {
            
            // Split the summit definition into vertex/texture/normal indices
            // indices are decremented because obj files start counting at 1, not 0
            x = x.split("/");
            vi.push(+x[0] - 1);
            if(x[1]){
              vti.push(+x[1] - 1);
            }
            if(x[2]){
              vni.push(+x[2] - 1);
            }
          });
        }
        break;
        
      // Set smoothness for the following faces of the current group
      case 's':
      
        // Get the new smoothness value
        tmp = (objparam == 0 || objparam == 'off') ? 0 : 1;

        // Save current group and create a new one (if it's not empty and if the smoothness has changed)
        if(vi.length && currents != tmp){
          endGroup();
        }
        
        // Set smoothness for the current group
        currents = tmp;
        break;
    }
  }
  
  // Push the last group in the current object and the last object in obj
  endGroup();
  obj.push(currentobj);
  return obj;
}