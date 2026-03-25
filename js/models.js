// models.js - Procedural 3D geometry factories
import * as THREE from 'three';

export function createCharacter(color = 0xe8c840, isPlayer = false) {
    const group = new THREE.Group();

    // Body (capsule-like)
    const bodyGeo = new THREE.CylinderGeometry(3, 3.5, 10, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 7;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(2.5, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: isPlayer ? 0xf0d860 : 0xddaa88 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 14;
    head.castShadow = true;
    group.add(head);

    // Gun
    const gunGeo = new THREE.BoxGeometry(1.5, 1, 8);
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(4, 9, 3);
    group.add(gun);
    group.userData.gun = gun;

    // Muzzle flash light
    const muzzleLight = new THREE.PointLight(0xffaa33, 0, 30);
    muzzleLight.position.set(4, 9, 8);
    group.add(muzzleLight);
    group.userData.muzzleLight = muzzleLight;

    return group;
}

export function createBuilding(w, h, locType) {
    const group = new THREE.Group();
    const depth = Math.min(w, h);
    const height = 15 + Math.random() * 15;

    // Wall color by type
    const wallColors = {
        town: 0x998877, depot: 0x889999, military: 0x667766,
        farm: 0xaa8855, lodge: 0x8B4513, lake: 0x887766, random: 0x887766
    };
    const wallColor = wallColors[locType] || 0x887766;

    // Walls
    const wallGeo = new THREE.BoxGeometry(w, height, h);
    const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.y = height / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    // Roof (slightly larger, darker)
    const roofGeo = new THREE.BoxGeometry(w + 3, 2, h + 3);
    const roofMat = new THREE.MeshLambertMaterial({ color: wallColor * 0.7 | 0 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = height + 1;
    roof.castShadow = true;
    group.add(roof);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(w - 2, h - 2);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xccbbaa });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.1;
    floor.receiveShadow = true;
    group.add(floor);

    // Windows (small dark boxes on sides)
    const winColor = 0x88aacc;
    for (let side = 0; side < 4; side++) {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            const winGeo = new THREE.PlaneGeometry(4, 5);
            const winMat = new THREE.MeshLambertMaterial({ color: winColor, side: THREE.DoubleSide });
            const win = new THREE.Mesh(winGeo, winMat);
            const t = (i + 1) / (count + 1);
            if (side === 0) { win.position.set(-w / 2 + w * t, height * 0.55, h / 2 + 0.1); }
            else if (side === 1) { win.position.set(w / 2 + 0.1, height * 0.55, -h / 2 + h * t); win.rotation.y = Math.PI / 2; }
            else if (side === 2) { win.position.set(-w / 2 + w * t, height * 0.55, -h / 2 - 0.1); }
            else { win.position.set(-w / 2 - 0.1, height * 0.55, -h / 2 + h * t); win.rotation.y = Math.PI / 2; }
            group.add(win);
        }
    }

    // Door (darker rectangle on one side)
    const doorGeo = new THREE.PlaneGeometry(6, 10);
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x553322, side: THREE.DoubleSide });
    const door = new THREE.Mesh(doorGeo, doorMat);
    const doorSide = Math.floor(Math.random() * 4);
    if (doorSide === 0) { door.position.set(0, 5, h / 2 + 0.1); }
    else if (doorSide === 1) { door.position.set(w / 2 + 0.1, 5, 0); door.rotation.y = Math.PI / 2; }
    else if (doorSide === 2) { door.position.set(0, 5, -h / 2 - 0.1); }
    else { door.position.set(-w / 2 - 0.1, 5, 0); door.rotation.y = Math.PI / 2; }
    group.add(door);

    return group;
}

export function createTree() {
    const group = new THREE.Group();

    // Trunk
    const trunkH = 8 + Math.random() * 6;
    const trunkGeo = new THREE.CylinderGeometry(1, 1.5, trunkH, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);

    // Foliage (2-3 spheres)
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
        const r = 5 + Math.random() * 4;
        const shade = 0.25 + Math.random() * 0.3;
        const leafGeo = new THREE.SphereGeometry(r, 6, 5);
        const leafMat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(shade * 0.3, shade + 0.15, shade * 0.2)
        });
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(
            (Math.random() - 0.5) * 4,
            trunkH + r * 0.5 + (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 4
        );
        leaf.castShadow = true;
        group.add(leaf);
    }

    return group;
}

export function createRock(w, h) {
    const group = new THREE.Group();
    const size = (w + h) / 4;
    const rockGeo = new THREE.DodecahedronGeometry(size, 0);
    const shade = 0.35 + Math.random() * 0.2;
    const rockMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(shade, shade - 0.02, shade - 0.04) });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.y = size * 0.5;
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.scale.set(1, 0.6 + Math.random() * 0.3, 1);
    rock.castShadow = true;
    group.add(rock);
    return group;
}

export function createBush() {
    const group = new THREE.Group();
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        const r = 2 + Math.random() * 2;
        const shade = 0.2 + Math.random() * 0.2;
        const geo = new THREE.SphereGeometry(r, 5, 4);
        const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(shade * 0.4, shade + 0.2, shade * 0.2) });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((Math.random() - 0.5) * 5, r * 0.7, (Math.random() - 0.5) * 5);
        mesh.castShadow = true;
        group.add(mesh);
    }
    return group;
}

export function createBulletMesh() {
    const geo = new THREE.SphereGeometry(0.5, 4, 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff88 });
    return new THREE.Mesh(geo, mat);
}

export function createLootItem(type) {
    const group = new THREE.Group();
    let color = 0xaaaaaa;
    if (type === 'weapon') color = 0x888888;
    else if (type === 'health') color = 0xee4444;
    else if (type === 'bandage') color = 0xff8888;
    else if (type === 'ammo') color = 0xeecc44;
    else if (type === 'armor') color = 0x4488ff;
    else if (type === 'helmet') color = 0x88ccff;

    const geo = new THREE.BoxGeometry(3, 2, 3);
    const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1.5;
    mesh.castShadow = true;
    group.add(mesh);

    return group;
}

export function createVehicleMesh(type) {
    const group = new THREE.Group();

    if (type === 'car') {
        // Body
        const bodyGeo = new THREE.BoxGeometry(14, 6, 26);
        const color = [0x4488cc, 0xcc4444, 0x44cc44, 0xcccc44][Math.floor(Math.random() * 4)];
        const bodyMat = new THREE.MeshLambertMaterial({ color });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 5;
        body.castShadow = true;
        group.add(body);

        // Roof
        const roofGeo = new THREE.BoxGeometry(12, 5, 14);
        const roofMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, 9, -2);
        group.add(roof);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(2, 2, 2, 8);
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        [[-6, 2, 8], [6, 2, 8], [-6, 2, -8], [6, 2, -8]].forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.position.set(...pos);
            wheel.rotation.z = Math.PI / 2;
            group.add(wheel);
        });

        // Windshield
        const windGeo = new THREE.PlaneGeometry(11, 4);
        const windMat = new THREE.MeshLambertMaterial({ color: 0x88bbee, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        const wind = new THREE.Mesh(windGeo, windMat);
        wind.position.set(0, 8, 6);
        wind.rotation.x = 0.3;
        group.add(wind);
    } else {
        // Bike
        const frameGeo = new THREE.BoxGeometry(6, 4, 18);
        const frameMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.y = 4;
        frame.castShadow = true;
        group.add(frame);

        const wheelGeo = new THREE.CylinderGeometry(2.5, 2.5, 1.5, 8);
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        [{ z: 7 }, { z: -7 }].forEach(({ z }) => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.position.set(0, 2.5, z);
            wheel.rotation.z = Math.PI / 2;
            group.add(wheel);
        });
    }

    return group;
}

export function createMountain(size) {
    const geo = new THREE.ConeGeometry(size, size * 1.5, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x667755 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = size * 0.75;
    mesh.castShadow = true;

    // Snow cap
    const snowGeo = new THREE.ConeGeometry(size * 0.3, size * 0.4, 8);
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xeeeeff });
    const snow = new THREE.Mesh(snowGeo, snowMat);
    snow.position.y = size * 1.35;
    mesh.add(snow);

    return mesh;
}
