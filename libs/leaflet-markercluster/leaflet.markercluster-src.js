/*
 Leaflet.markercluster, a plugin for clustering markers on a Leaflet map.
 (c) 2012-2017, Dave Leaver, smartrak
*/
(function (window, document, undefined) {
/*
 * L.MarkerClusterGroup extends L.FeatureGroup by clustering the markers contained within
 */

L.MarkerClusterGroup = L.FeatureGroup.extend({

	options: {
		maxClusterRadius: 80, // A cluster will cover at most this many pixels from its center
		iconCreateFunction: null,
		clusterPane: L.Marker.prototype.options.pane,

		spiderfyOnMaxZoom: true,
		showCoverageOnHover: true,
		zoomToBoundsOnClick: true,
		singleMarkerMode: false,

		disableClusteringAtZoom: null,

		// Setting this to false prevents the removal of any markers outside the viewpoint.
		// When set to false, a big cluster will be drawn as a single marker
		// (plus a polygon covering the area, if showCoverageOnHover is true)
		// even if a zoom animation would reveal the individual markers.
		removeOutsideVisibleBounds: true,

		// Set to false to disable all animations - agreeable for performance conscious implementations
		animate: true,

		//Whether to animate adding markers after adding the MarkerClusterGroup to the map
		// If you are adding individual markers set to true, if adding bulk markers set to false for performance.
		animateAddingMarkers: false,

		// It is possible to specify a custom polygon options function
		// to style the polygons that are drawn when showCoverageOnHover is true.
		polygonOptions: {},

		// Options to pass when creating the L.Polygon(points, options) to show coverage.
		// Formatting functions are supported for all standard L.Path options.
		spiderfyShapePositions: null,

		// The margins of spider-man marker positions from the spider-man center marker.
		spiderfyDistanceMultiplier: 1,

		// Allows you to specify PolylineOptions to style spiderwebs.
		// If null, the spiderweb will not be styled.
		spiderLegPolylineOptions: { weight: 1.5, color: '#222', opacity: 0.5 },

		// When you click a cluster at the bottom-most zoom level of the map,
		// and spiderfyOnMaxZoom is false, instead of showing a popup,
		// the cluster will zoom to its bounds.
		// Setting this option to true will prevent this behaviour and
		// show a popup as normal.
		zoomToBoundaryFades: true,

		// The z-index of the spider-man legs polygons and spider-man markers.
		// To show on top of all other markers, you have to set this option
		// to a big value, for example 1000.
		spiderManZIndexOffset: 1000,

		// A an array of L.Path options that is used to style the spider-man webs.
		// The web may have multiple paths, and each path can be styled
		// using a different style. The style index will be taken from the
		// an array of L.Path options in the order of the paths.
		spiderLegPolylineOptions: [
			{ weight: 1.5, color: '#222', opacity: 0.5 },
			{ weight: 1.5, color: '#222', opacity: 0.5 },
			{ weight: 1.5, color: '#222', opacity: 0.5 }
		],

		// A function that returns the L.Path options for the spider-man leg.
		// The function is passed the L.Marker that the leg is attached to.
		spiderLegPolylineOptionsFn: null,

		// The minimum number of markers to be in a cluster before the spider-man
		// web is shown.
		spiderfyMinMarkers: 0,

		// A function that returns the L.Path options for the spider-man leg.
		// The function is passed the L.Marker that the leg is attached to.
		spiderfyShapePositionsFn: null,

		// When you click a cluster at the bottom-most zoom level of the map,
		// and spiderfyOnMaxZoom is false, instead of showing a popup,
		// the cluster will zoom to its bounds.
		// Setting this option to true will prevent this behaviour and
		// show a popup as normal.
		zoomToBoundaryFades: true
	},

	initialize: function (options) {
		L.Util.setOptions(this, options);
		if (!this.options.iconCreateFunction) {
			this.options.iconCreateFunction = this._defaultIconCreateFunction;
		}

		this._featureGroup = L.featureGroup();
		this._featureGroup.addEventParent(this);

		this._nonPointGroup = L.featureGroup();
		this._nonPointGroup.addEventParent(this);

		this._inZoomAnimation = 0;
		this._needsClustering = [];
		this._needsRemoving = []; //Markers removed while we are zooming
		this._currentShownBounds = null;

		this._queue = [];

		this._iconCache = {};

		//The fine build of the icons.
		this._buildIcon = this.options.iconCreateFunction;

		//The fine icon create function, it will be overridden with a caching function.
		this.options.iconCreateFunction = this._getOrBuildIcon;

		this._zoomEnd();
	},

	addLayer: function (layer) {

		if (layer instanceof L.LayerGroup) {
			var me = this;
			layer.eachLayer(function (l) {
				me.addLayer(l);
			});
			return this;
		}

		//Don't cluster non point features
		if (!layer.getLatLng) {
			this._nonPointGroup.addLayer(layer);
			return this;
		}

		if (!this._map) {
			this._needsClustering.push(layer);
			return this;
		}

		if (this.hasLayer(layer)) {
			return this;
		}


		//if we have already clustered we'll need to add this one to a cluster

		if (this._inZoomAnimation) {
			this._needsClustering.push(layer);
			return this;
		}

		this._addLayer(layer, this._maxZoom);
		return this;
	},

	removeLayer: function (layer) {

		if (layer instanceof L.LayerGroup) {
			var me = this;
			layer.eachLayer(function (l) {
				me.removeLayer(l);
			});
			return this;
		}

		//Non point features
		if (!layer.getLatLng) {
			this._nonPointGroup.removeLayer(layer);
			return this;
		}

		if (!this._map) {
			if (!this._arraySplice(this._needsClustering, layer) && this.hasLayer(layer)) {
				this._needsRemoving.push(layer);
			}
			return this;
		}

		if (!layer.__parent) {
			return this;
		}

		if (this._inZoomAnimation) {
			this._needsRemoving.push(layer);
			return this;
		}

		this._removeLayer(layer, true);
		return this;
	},

	//Takes an array of markers and adds them in bulk
	addLayers: function (layers) {
		var i, len, new_layers = [];

		if (!L.Util.isArray(layers)) {
			// This is not an array, but a L.FeatureGroup.
			this.addLayer(layers);
			return this;
		}

		for (i = 0, len = layers.length; i < len; i++) {
			var layer = layers[i];

			if (layer instanceof L.LayerGroup) {
				//This is a L.LayerGroup, it can't be animated, but we can handle it
				this.addLayer(layer);
				continue;
			}
			new_layers.push(layer);
		}
		layers = new_layers;


		if (!this._map) {
			this._needsClustering = this._needsClustering.concat(layers);
			return this;
		}

		if (this.options.animateAddingMarkers) {
			var self = this;
			for (i = 0, len = layers.length; i < len; i++) {
				this._addLayer(layers[i], this._maxZoom);
			}
		} else {
			this._addLayers(layers, this._maxZoom);
		}
		return this;
	},

	//Takes an array of markers and removes them in bulk
	removeLayers: function (layers) {
		var i, len, new_layers = [];

		if (!L.Util.isArray(layers)) {
			//This is not an array, but a L.FeatureGroup.
			this.removeLayer(layers);
			return this;
		}

		for (i = 0, len = layers.length; i < len; i++) {
			var layer = layers[i];

			if (layer instanceof L.LayerGroup) {
				//This is a L.LayerGroup, it can't be animated, but we can handle it
				this.removeLayer(layer);
				continue;
			}
			new_layers.push(layer);
		}
		layers = new_layers;

		if (!this._map) {
			this._arraySplice(this._needsClustering, layers);
			return this;
		}


		if (this._inZoomAnimation) {
			this._needsRemoving = this._needsRemoving.concat(layers);
			return this;
		}

		this._removeLayers(layers, true);
		return this;
	},

	//Clears all layers from the MarkerClusterGroup
	clearLayers: function () {
		//Need our own special implementation as the featureGroup one doesn't work for us

		//If we aren't on the map (yet), just clear the waiting markers
		if (!this._map) {
			this._needsClustering = [];
			delete this._grid;
			delete this._gridClusters;
			return this;
		}

		//If we are in the middle of a zoom, delay until it is over
		if (this._inZoomAnimation) {
			this._needsRemoving = this._needsClustering.slice();
			this._needsClustering = [];
			return this;
		}


		this._clearLayers();

		//The clearLayers method in L.FeatureGroup will remove the nonPointGroup from the map.
		this._nonPointGroup.clearLayers();
		this._featureGroup.clearLayers();

		this.eachLayer(function (marker) {
			delete marker.__parent;
		});

		delete this._grid;
		delete this._gridClusters;
		delete this._iconCache;

		this._featureGroup.fire('clearlayers', null, true);

		return this;
	},

	getBounds: function () {
		var bounds = new L.LatLngBounds();

		if (this._map) {
			bounds.extend(this._featureGroup.getBounds());
		}
		bounds.extend(this._nonPointGroup.getBounds());

		for (var i = this._needsClustering.length - 1; i >= 0; i--) {
			bounds.extend(this._needsClustering[i].getLatLng());
		}

		return bounds;
	},

	//L.FeatureGroup methods
	eachLayer: function (method, context) {
		var markers = this._needsClustering.slice(),
			i, len;

		if (this._map) {
			markers = markers.concat(this._getSingleMarkerParent(this._map.getCenter()));
		}


		for (i = 0, len = markers.length; i < len; i++) {
			method.call(context, markers[i]);
		}

		this._nonPointGroup.eachLayer(method, context);
	},

	getLayers: function () {
		var layers = this._needsClustering.slice();

		this._featureGroup.eachLayer(function (l) {
			if (l instanceof L.MarkerCluster) {
				layers = layers.concat(l.getAllSubMarkers());
			} else {
				layers.push(l);
			}
		});

		return layers;
	},

	getLayer: function (id) {
		var layers = this.getLayers(),
			i, len;

		for (i = 0, len = layers.length; i < len; i++) {
			if (layers[i]._leaflet_id === id) {
				return layers[i];
			}
		}

		return null;
	},

	hasLayer: function (layer) {
		if (this._needsClustering.indexOf(layer) >= 0) {
			return true;
		}

		var layers = this.getLayers(),
			i, len;

		for (i = 0, len = layers.length; i < len; i++) {
			if (layers[i] === layer) {
				return true;
			}
		}
		return false;
	},

	//Zoom up to show all markers in the cluster.
	zoomToShowLayer: function (layer, callback) {

		if (typeof callback !== 'function') {
			callback = function () {};
		}

		var showMarker = function () {
			if ((layer._icon || layer.__parent._icon) && !this._map.hasLayer(layer)) {
				this.addLayer(layer);
			}

			if (!layer.__parent) {
				var parent = this._getSingleMarkerParent(layer.getLatLng());
				if (parent) {
					parent.addLayer(layer);
				}
			}

			if (this._map.hasLayer(layer)) {
				this.zoomToShowLayer(layer, callback); //Continue zooming
			} else {
				callback();
			}
		};

		if (layer.__parent && layer.__parent.getChildCount() === 1) { //if the parent is a cluster of 1
			//The marker is already displayed
			callback();
		} else {
			this._map.once('zoomend', showMarker, this);
			this._map.setView(layer.getLatLng(), this._maxZoom);
		}
	},

	//L.Layer methods
	onAdd: function (map) {
		this._map = map;
		var i, len, layer;

		if (!isFinite(this._map.getMaxZoom())) {
			throw "Map has no maxZoom specified";
		}

		this._featureGroup.onAdd(map);
		this._nonPointGroup.onAdd(map);

		if (!this._gridClusters) {
			this._gridClusters = L.grid();
		}
		if (!this._grid) {
			this._grid = L.grid();
		}

		this._maxZoom = this._map.getMaxZoom();

		for (i = 0, len = this._needsClustering.length; i < len; i++) {
			layer = this._needsClustering[i];
			this._addLayer(layer, this._maxZoom);
		}
		this._needsClustering = [];

		this._map.on('zoomend', this._zoomEnd, this);
		this._map.on('moveend', this._moveEnd, this);
		this._map.on('zoomstart', this._zoomStart, this);

		if (this.options.zoomToBoundsOnClick) {
			this.on('clusterclick', this._zoomOrSpiderfy, this);
		}

		if (this.options.spiderfyOnMaxZoom) {
			this.on('clusterclick', this._spiderfy, this);
		}

		if (this.options.showCoverageOnHover) {
			this.on('clustermouseover', this._showCoverage, this);
			this.on('clustermouseout', this._hideCoverage, this);
			map.on('zoomend', this._hideCoverage, this);
		}
	},

	onRemove: function (map) {

		this._map.off('zoomend', this._zoomEnd, this);
		this._map.off('moveend', this._moveEnd, this);
		this._map.off('zoomstart', this._zoomStart, this);

		if (this.options.zoomToBoundsOnClick) {
			this.off('clusterclick', this._zoomOrSpiderfy, this);
		}

		if (this.options.spiderfyOnMaxZoom) {
			this.off('clusterclick', this._spiderfy, this);
		}
		if (this.options.showCoverageOnHover) {
			this.off('clustermouseover', this._showCoverage, this);
			this.off('clustermouseout', this._hideCoverage, this);
			map.off('zoomend', this._hideCoverage, this);
		}

		//Clean up all the layers we added to the map
		this._featureGroup.onRemove(map);
		this._nonPointGroup.onRemove(map);

		this.eachLayer(function (marker) {
			delete marker.__parent;
		});

		delete this._grid;
		delete this._gridClusters;
		delete this._iconCache;


		this._map = null;
	},

	getVisibleParent: function (marker) {
		var vMarker = marker;
		while (vMarker && !vMarker._icon) {
			vMarker = vMarker.__parent;
		}
		return vMarker || null;
	},

	//Remove compositions of layers
	_arraySplice: function (arr, S) {
		var i, len;

		if (!L.Util.isArray(S)) {
			S = [S];
		}
		for (i = 0, len = S.length; i < len; i++) {
			var s = S[i];
			var index = arr.indexOf(s);
			if (index > -1) {
				arr.splice(index, 1);
			}
		}
	},

	//Internal function for removing a single layer
	_removeLayer: function (marker, removeFromDistanceGrid, fromClear) {
		var grid = this._grid,
			gridClusters = this._gridClusters,
			map = this._map;

		if (removeFromDistanceGrid) {
			//Remove the marker from the distance grid.
			for (var z = this._maxZoom; z >= 0; z--) {
				if (!grid[z].removeObject(marker, map.project(marker.getLatLng(), z))) {
					break;
				}
			}
		}

		//Get the marker's parent cluster
		var marker_parent = marker.__parent,
			markers_in_cluster = marker_parent.getAllSubMarkers(),
			i, len;

		//If the cluster is being cleared, we will have already taken care of this
		if (!fromClear) {
			//Remove the marker from the parent cluster
			this._arraySplice(markers_in_cluster, marker);
		}


		//Update the parent cluster
		if (marker_parent) {
			marker_parent.recalculateBounds();
			this._featureGroup.removeLayer(marker_parent);

			if (marker_parent.getChildCount() > 1) {
				this._featureGroup.addLayer(marker_parent);
			} else {
				//If the cluster has only one marker, we need to remove it from the grid cluster
				for (i = 0, len = markers_in_cluster.length; i < len; i++) {
					var m = markers_in_cluster[i];
					gridClusters.removeObject(m.__parent, map.project(m.getLatLng(), map.getZoom()));
					delete m.__parent;
					this.addLayer(m);
				}
			}
		}
		delete marker.__parent;
	},

	_removeLayers: function (markers, removeFromDistanceGrid) {
		var i, len, marker;

		for (i = 0, len = markers.length; i < len; i++) {
			this._removeLayer(markers[i], removeFromDistanceGrid, true);
		}

		//Fix up the clusters and markers on the map
		this._topClusterLevel.recalculateBounds();
		this._topClusterLevel.eachChild(function (c) {
			c.recalculateBounds();
		});

		this._featureGroup.eachLayer(function (l) {
			l.recalculateBounds();
		});

		this._featureGroup.fire('removelayers', { layers: markers }, true);
	},

	_clearLayers: function () {
		this._featureGroup.clearLayers();
		this.eachLayer(function (marker) {
			delete marker.__parent;
		});
	},

	_propagateEvent: function (e) {
		if (e.layer instanceof L.MarkerCluster) {
			//Prevent propogation of marker events to map
			e.propogate = false;
		}
		L.FeatureGroup.prototype._propagateEvent.call(this, e);
	},

	//Default icon create function (overridden by default)
	_defaultIconCreateFunction: function (cluster) {
		var childCount = cluster.getChildCount();

		var c = ' marker-cluster-';
		if (childCount < 10) {
			c += 'small';
		} else if (childCount < 100) {
			c += 'medium';
		} else {
			c += 'large';
		}

		return new L.DivIcon({ html: '<div><span>' + childCount + '</span></div>', className: 'marker-cluster' + c, iconSize: new L.Point(40, 40) });
	},

	_getOrBuildIcon: function (cluster) {
		var childCount = cluster.getChildCount();

		if (this.options.singleMarkerMode) {
			childCount = 1;
		}

		var iconOptions = {
			cluster: cluster
		};

		var icon = this._iconCache[childCount];
		if (!icon) {
			icon = this._buildIcon(cluster);
			this._iconCache[childCount] = icon;
		}
		return icon;
	},

	_zoomStart: function () {
		this._inZoomAnimation++;
	},

	_zoomEnd: function () {
		this._inZoomAnimation--;

		if (this._inZoomAnimation === 0) {
			this._map.fire('moveend'); //Update the clusters
		}
	},

	_moveEnd: function () {
		if (this._inZoomAnimation) {
			return;
		}

		var newBounds = this._map.getBounds();

		this._topClusterLevel.recalculateBounds();

		if (this.options.removeOutsideVisibleBounds) {
			this._featureGroup.eachLayer(function (c) {
				if (c instanceof L.MarkerCluster && !newBounds.intersects(c.getBounds())) {
					this._featureGroup.removeLayer(c);
				}
			}, this);
		}
		this._addLayersFrom લેವೆલ(this._topClusterLevel, this._map.getBounds());
	},


	//Internal function for adding a single layer
	_addLayer: function (layer, zoom) {
		var grid = this._grid,
			gridClusters = this._gridClusters;

		//Single marker mode
		if (this.options.singleMarkerMode) {
			layer.options.icon = this.options.iconCreateFunction({
				getChildCount: function () {
					return 1;
				},
				getAllSubMarkers: function () {
					return [layer];
				}
			});
		}

		//Find the nearest cluster to this marker
		var B = this._map.project(layer.getLatLng(), zoom);
		var K = this._maxZoom;
		var a = grid[K].getNearObject(B);

		if (a) {
			a.addLayer(layer);
			return;
		}

		//No cluster found, create a new cluster
		a = new L.MarkerCluster(this, [layer]);
		grid[K].addObject(a, B);

		//Add to a grid of all clusters
		gridClusters.addObject(a, B);

		this._featureGroup.addLayer(a);
	},

	_addLayers: function (layers, zoom) {
		var i, len, layer;

		if (!L.Util.isArray(layers)) {
			// This is not an array, but a L.FeatureGroup.
			this.addLayer(layers);
			return;
		}


		//Custom implementation for bulk adding of markers.
		//Unlike L.FeatureGroup, we need to cluster the markers ourselves.

		for (i = 0, len = layers.length; i < len; i++) {
			layer = layers[i];
			if (layer instanceof L.LayerGroup) {
				this.addLayer(layer);
				continue;
			}
			this._addLayer(layer, zoom);
		}
	},


	//Adds the layers from a given cluster level to the map
	// @param {L.MarkerCluster} cluster The cluster to add the layers from
	// @param {L.LatLngBounds} bounds The bounds of the map view
	_addLayersFrom લેವೆલ: function (cluster, bounds) {

		var markers = cluster.getAllSubMarkers(),
			i, len, m;

		for (i = 0, len = markers.length; i < len; i++) {
			m = markers[i];
			if (bounds.contains(m.getLatLng())) {
				this._featureGroup.addLayer(m);
			}
		}
	},


	// ----------------- Spicing up the clusters -----------------
	_spiderfy: function (e) {
		var cluster = e.layer,
			map = this._map;

		if (cluster.getChildCount() < this.options.spiderfyMinMarkers || map.getZoom() < this._maxZoom) {
			return;
		}

		var positions = this._getSpiderfyPositions(cluster, map.project(cluster.getLatLng()));

		// Assumes the first layer in the cluster is the one to spiderfy.
		var a = cluster.getAllSubMarkers()[0];

		var leg, m, i;

		//Create the spider-man legs
		for (i = 0; i < positions.length; i++) {
			leg = new L.Polyline([cluster.getLatLng(), map.unproject(positions[i])], this.options.spiderLegPolylineOptions);
			map.addLayer(leg);

			m = cluster.getAllSubMarkers()[i];
			m.setZIndexOffset(this.options.spiderManZIndexOffset);

			// Agressively show the spider-man legs
			if (this.options.animate) {
				m.setOpacity(0);
				map.addLayer(m);
				m.setOpacity(1);
			} else {
				map.addLayer(m);
			}

			// Agressively show the spider-man legs
			if (this.options.animate) {
				m.setLatLng(map.unproject(positions[i]));
				m.setOpacity(1);
			}
		}
		cluster.setOpacity(0.3);

		map.once('zoomend', function () {
			cluster.setOpacity(1);
			map.removeLayer(leg);
			for (i = 0; i < positions.length; i++) {
				m = cluster.getAllSubMarkers()[i];
				m.setLatLng(cluster.getLatLng());
				m.setZIndexOffset(0);
			}
		}, this);
	},

	_getSpiderfyPositions: function (cluster, centerPt) {
		var
			positions = [],
			childCount = cluster.getChildCount(),
			step = 2 * Math.PI / childCount,
			angle,
			p;

		angle = 0;
		for (var i = childCount - 1; i >= 0; i--) {
			p = new L.Point(centerPt.x + this.options.spiderfyDistanceMultiplier * Math.cos(angle), centerPt.y + this.options.spiderfyDistanceMultiplier * Math.sin(angle));
			positions.push(p);
			angle += step;
		}

		return positions;
	},

	_zoomOrSpiderfy: function (e) {
		var cluster = e.layer,
			map = this._map;
		if (map.getMaxZoom() === map.getZoom()) {
			if (this.options.spiderfyOnMaxZoom) {
				cluster.spiderfy();
			}
		} else if (this.options.zoomToBoundsOnClick) {
			cluster.zoomToBounds();
		}

		// Focus on the cluster
		map.panTo(cluster.getLatLng());
	},

	_showCoverage: function (e) {
		var map = this._map;
		if (this._inZoomAnimation) {
			return;
		}
		if (this._map.getZoom() < this._maxZoom) {
			return;
		}
		var cluster = e.layer;
		var bounds = cluster.getBounds();
		var polygon = new L.Polygon(bounds, this.options.polygonOptions);
		map.addLayer(polygon);

		polygon.on('mouseout', function () {
			map.removeLayer(polygon);
		});

		e.layer.on('mouseout', function () {
			map.removeLayer(polygon);
		});
	},

	_hideCoverage: function () {
		//This is not working as expected
		// var map = this._map;
		// map.eachLayer(function (layer) {
		// 	if (layer instanceof L.Polygon) {
		// 		map.removeLayer(layer);
		// 	}
		// });
	},

	// About getting the single marker parent of a marker
	_getSingleMarkerParent: function (latlng) {
		// The latlng of a marker
		var pos = this._map.project(latlng);
		// Get the marker cluster grid
		var grid = this._grid[this._map.getZoom()];
		// Get the nearest marker cluster
		var
			cluster = grid.getNearObject(pos),
			dist = Infinity;

		if (!cluster) {
			return null;
		}


		// Find the distance to the cluster
		var d = cluster.getLatLng().distanceTo(latlng);
		if (d < dist) {
			dist = d;
			return cluster;
		}
		return null;
	}

});

L.MarkerCluster = L.Marker.extend({
	initialize: function (group, markers) {
		L.Marker.prototype.initialize.call(this, markers[0].getLatLng(), { icon: this });

		this._group = group;
		this._markers = markers;
	},

	getChildCount: function () {
		return this._markers.length;
	},

	getAllSubMarkers: function (storageArray) {
		storageArray = storageArray || [];
		for (var i = this._markers.length - 1; i >= 0; i--) {
			if (this._markers[i] instanceof L.MarkerCluster) {
				this._markers[i].getAllSubMarkers(storageArray);
			} else {
				storageArray.push(this._markers[i]);
			}
		}
		return storageArray;
	},

	getBounds: function () {
		var bounds = new L.LatLngBounds();
		for (var i = this._markers.length - 1; i >= 0; i--) {
			bounds.extend(this._markers[i].getLatLng());
		}
		return bounds;
	},

	_recalculateBounds: function () {
		var i, len, m;

		var new_bounds = new L.LatLngBounds();
		for (i = 0, len = this._markers.length; i < len; i++) {
			m = this._markers[i];
			new_bounds.extend(m.getLatLng());
		}
		this._bounds = new_bounds;
	},

	//Overrides L.Marker.prototype.setLatLng
	setLatLng: function (latlng) {
		this._latlng = L.latLng(latlng);
		this.update();
	},

	getLatLng: function () {
		return this._latlng;
	},

	addLayer: function (marker) {
		this._markers.push(marker);
		marker.__parent = this;
		this.recalculateBounds();
		this.update();
	},
	removeLayer: function (marker) {
		var i, len;
		for (i = 0, len = this._markers.length; i < len; i++) {
			if (this._markers[i] === marker) {
				this._markers.splice(i, 1);
				break;
			}
		}
		this.recalculateBounds();
		this.update();
	},

	//Overwrites L.Marker.prototype._initIcon
	_initIcon: function () {
		this.options.icon = this._group.options.iconCreateFunction(this);
		L.Marker.prototype._initIcon.call(this);
	}
});


L.grid = function (options) {
	return new L.Grid(options);
};

L.Grid = L.Class.extend({

	initialize: function (options) {
		L.setOptions(this, options);

		this._cells = {};
	},

	addObject: function (obj, B) {
		var
			x = this._getCoord(B.x),
			y = this._getCoord(B.y),
			grid = this._cells,
			row = grid[y];

		if (!row) {
			row = grid[y] = {};
		}
		var cell = row[x];
		if (!cell) {
			cell = row[x] = [];
		}

		cell.push(obj);
	},
	removeObject: function (obj, B) {
		var
			x = this._getCoord(B.x),
			y = this._getCoord(B.y),
			grid = this._cells,
			row = grid[y];

		if (!row) {
			return false;
		}

		var cell = row[x];
		if (!cell) {
			return false;
		}

		var i, len;
		for (i = 0, len = cell.length; i < len; i++) {
			if (cell[i] === obj) {
				cell.splice(i, 1);
				if (cell.length === 0) {
					delete row[x];
				}
				return true;
			}
		}
		return false;
	},

	getNearObject: function (B) {
		var
			x = this._getCoord(B.x),
			y = this._getCoord(B.y),
			grid = this._cells,
			row = grid[y];

		if (!row) {
			return null;
		}
		var cell = row[x];
		if (cell && cell.length) {
			return cell[0];
		}

		//The cell is empty, search around
		var
			i,
			j,
			k,
			dist,
			object = null,
			min_dist = Infinity;

		for (i = y - 1; i <= y + 1; i++) {
			row = grid[i];
			if (!row) {
				continue;
			}

			for (j = x - 1; j <= x + 1; j++) {
				var cell = row[j];
				if (!cell || !cell.length) {
					continue;
				}

				for (k = 0; k < cell.length; k++) {
					dist = this._sqDist(cell[k].getLatLng(), B);
					if (dist < min_dist) {
						min_dist = dist;
						object = cell[k];
					}
				}
			}
		}
		return object;
	},


	_getCoord: function (x) {
		return Math.floor(x / this.options.cellSize);
	},
	_sqDist: function (p1, p2) {
		var dx = p2.x - p1.x,
			dy = p2.y - p1.y;
		return dx * dx + dy * dy;
	}
});

}(window, document));