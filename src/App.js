import React, {Component} from 'react';
import './App.css';
const secrets = require('./secrets.json');
//import logo from './logo.svg';
const axios = require('axios');
const stores = require('./stores.json');
let cities = require('cities');

const queryString = require('query-string');

let allStores = stores.allStores;

const randomApiDomain = () => {
  let domains = secrets.domains;
  //let domains = ['a.localhost:3001', 'b.localhost:3001', 'c.localhost:3001'];
  return domains[Math.floor(Math.random()*domains.length)];
}
const formatCurrency = (num) => {
  return '$' + Number.parseFloat(num).toFixed(2);
}

const saveSearch = (product) => {
  let url = `https://${randomApiDomain()}/products`;
  //let url = 'http://localhost:3001/products';
  axios.post(url, product).catch(e => console.log('save search failed'));
}
const getUPC = async (sku) => {
  const url = `https://${randomApiDomain()}/upc/${sku}`;
  let resp = await axios.get(url).catch(err => {return {data: {upc:0, variants : ''}}});
  return {upc: resp.data.upc, variants: resp.data.variants};
};

const insertInList = (arr, elem) => {
  let len = 0;
  if (Array.isArray(arr)) {
    len = arr.length;
  }

  if (len === 0) {
    arr = [];
    arr.push(elem);
    return arr;
  }

  let inserted = false;
  for (let i = 0; i < len; i++) {
    if (elem.price <= arr[i].price) {
      arr.splice(i, 0, elem);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    arr.splice(len, 0, elem);
  }

  return arr;
};

//===============
class App extends Component {
  constructor() {
    super();
    this.state = {
      upc: '',
      zip: '',
      storePrices: [],
      product: {},
      progress: 0,
      statusMessage: '',
      searches: [],
      showInstructions: false
    }

    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleSearch = this.handleSearch.bind(this);
    this.handleSearchAgain = this.handleSearchAgain.bind(this);
    this.searchStores = this.searchStores.bind(this);
    this.searchHistory = this.searchHistory.bind(this);
    this.getLocalZip = this.getLocalZip.bind(this);
    this.toggleInstructions = this.toggleInstructions.bind(this);
  }

  searchHistory = async (q) => {
    let url = `https://${randomApiDomain()}/products`;
    //let url = 'http://localhost:3001/products';
    let searches = [];
    axios.get(url, {
      params: {
        count: 50,
        q: q
      }
    }).then(response => {
      if (response && response.data) {
        searches = response.data;
      }
      searches = searches.map(s => {
        let store = allStores.filter(store => store.zip === s.zip)[0];
        delete s.createdDate;
        delete s._id;
        delete s.__v;
        return {...s, storeId: store?store.no:0, address: store?store.address:''};
      });
      this.setState({searches});
    })
    .catch(e => {
      console.log('Cannot get recent searches', e);
    });
  }

  toggleInstructions = () => {
    this.setState({showInstructions: !this.state.showInstructions});
  }

  searchStores = async (upc, zip, inStockOnly, minQty) => {
    let [numStores, storeCount, lowPrice, lowZip, numResults] = [200, 4683, 9999, 0, 10];
    if (zip) {
      storeCount = 100;
      numResults = 100;
    }

    if (this.state.showAll) {
      numResults = 1000;
    }

    if (upc.length < 12) {
      let resp = await getUPC(upc);
      upc = resp.upc;
      this.setState({variants: resp.variants});
    }

    if (!upc) {
      console.log('UPC not found');
      this.setState({progress: 100, statusMessage: 'Cannot get item details. Try later or enter UPC'});
      return;
    }
    let progress = 0;

    for (let i = 0; i< storeCount; i = i + numStores) {
      let url = `https://${randomApiDomain()}/stores-by-code/${upc}`;
      //let url = `http://localhost:3001/stores-by-code/${upc}`;
      axios.get(url, {
        params: {
          start: i,
          stores: numStores,
          zip: zip,
          inStockOnly: inStockOnly,
          minqty: minQty
        }
      })
      .then(resp => {
        if (resp.data.item && resp.data.item.sku && !this.state.product.sku) {
          resp.data.item.variants = this.state.variants;
          resp.data.item.upc = upc;
          this.setState({product: resp.data.item});
        }

        let storePrices = this.state.storePrices;
        resp.data.storePrices.map(s => {
          storePrices = insertInList(storePrices, s);
          return null;
        });

        this.setState({storePrices: storePrices.slice(0, numResults)});
        progress = Math.min(100, this.state.progress + numStores * 100 /storeCount);
        this.setState({progress});
        if (progress === 100) {
          this.setState({statusMessage: 'Done!'})
          let product = (({ name, sku, upc, variants, stores}) => ({name, sku, upc, variants, stores}))(this.state.product);
          if (storePrices.length > 0) {
            [lowPrice, lowZip] = [storePrices[0].price, storePrices[0].zip];
          }
          product = {...product, price:lowPrice, zip: '00000'.concat(lowZip).slice(-5)};
          if (product && product.sku) {
            if (this.state.userZip) {
              product.userZip = this.state.userZip;
            }
            saveSearch(product);
          }
        }
      })
      .catch (e => {
        progress = Math.min(100, this.state.progress + numStores * 100 /storeCount);
        this.setState({progress});

        console.log('errored', progress, e);
      })
    }
  }

  getLocalZip = () => {
    navigator.geolocation.getCurrentPosition(pos => {
      let addr = cities.gps_lookup(pos.coords.latitude, pos.coords.longitude);
      this.setState({userZip: addr.zipcode});
    });
  }

  handleChange(event) {
    let val = (event.target.name === 'inStockOnly') ? event.target.checked: event.target.value;
    this.setState({[event.target.name]: val});
  }

  handleSubmit(event) {
    this.setState({progress: 1, statusMessage: '', product: {}, variants: ''});

    if (this.state.upc.length > 3) {
      this.setState({storePrices: []});
      this.searchStores(this.state.upc, this.state.zip, this.state.inStockOnly, this.state.minQty);
    }
    if (event) {
      event.preventDefault();
    }
  }

  handleSearch(event) {
    this.searchHistory(this.state.q);
    if (event) {
      event.preventDefault();
    }
  }

  handleSearchAgain (upc, event) {
    if (event) {
      event.preventDefault();
    }
    this.setState({upc: upc.toString()});
    setTimeout(() => {
      this.handleSubmit();
    }, 1000 / 60);
  }

  componentDidMount() {
    this.getLocalZip();
    let query = queryString.parseUrl(window.location.href).query;
    let upc = query.item || '';
    let zip = query.zip || '';
    let showAll = query.showall;
    let minQty = parseInt(query.minqty);
    this.setState({showAll: (showAll === 'yes'), minQty, zip});

    if (upc) {
        upc = upc.trim().slice(-12);
      this.setState({upc});
      setTimeout(() => {
        this.handleSubmit();
      }, 1000 / 60);
    }

    this.searchHistory();
  }
  render() {
    const tableDisplay = (this.state.storePrices.length > 0 )?'table-row':'none';
    const productDisplay = (this.state.product && this.state.product.sku)? 'block': 'none';

    return ( <div className = "App" >
      <div className = "Entry" >
      <div>
      <div>
      <h2>Walmart nationwide low price search</h2>
      <button onClick={this.toggleInstructions.bind(this)}>Instructions to use it with a barcode app</button>
      <br/>
      Enter SKU or UPC. Enter zip for local search and Pickup Today info. <br/>
      *One search at a time. No multi-tab search please!* <br/>
      Issues / comments? <a target="_blank" rel="noopener noreferrer" className="twitter-mention-button" href="https://twitter.com/intent/tweet?screen_name=walseek">@walseek</a>
      <br/>
      <div style={{textAlign:"left", marginLeft: "40%", display: this.state.showInstructions?"block":"none"}}>
        It's handy when you're at a store and want to know the lowest price.
        <ul>
          <li><a target="_blank" rel="noopener noreferrer" href="https://itunes.apple.com/us/app/barcode/id522354642">Install this iOS Barcode app</a></li>
          <li>Settings (Bottom right gear icon) -> Custom URL</li>
          <li>Prefix: https://vkana.github.io/walseek?item= </li>
          <li>Name: Walseek (or whatever)</li>
          <li><a target="_blank" rel="noopener noreferrer" href="https://play.google.com/store/apps/details?id=com.google.zxing.client.android">Similar app and setup for Android</a></li>
          <li>Goto app and scan a barcode, select Walseek!</li>
        </ul>

      </div>
      </div><br/>
      <form onSubmit={this.handleSubmit}>
        <label>SKU / UPC: </label>
        <input type = "text" name="upc" value={this.state.upc} onChange={this.handleChange}/>
        <label> ZIP: </label>
        <input type = "text" name="zip" value={this.state.zip} onChange={this.handleChange}/>
        <label> In Stock Only: </label>
        <input type = "checkbox" name="inStockOnly" defaultChecked={this.state.inStockOnly} onChange={this.handleChange}/>
        <input disabled={this.state.progress > 0 && this.state.progress < 100} type="submit" value="Submit" />
      </form>

      <div id="progressbar">
      <div id="progress" style={{width:`${this.state.progress}%`}}>{this.state.statusMessage}</div>
      </div>
      <br/>


          <div style={{display:productDisplay}}>
          <div>Walmart: <a target="_blank" rel="noopener noreferrer" href={this.state.product.url}>{this.state.product.name}</a></div>
          <div>SKU: <a target="_blank" rel="noopener noreferrer" href={this.state.product.bsUrl}>{this.state.product.sku}</a> |
          UPC: <a target="_blank" rel="noopener noreferrer" href={`http://barcode.live/?upc=${this.state.product.upc}`}>{this.state.product.upc}</a></div>
          <div>Online Price: {this.state.product.onlinePrice} | Sold: {this.state.product.offerType}</div>
          <div style={{display:(this.state.product.variants)?'block':'none'}}>Variants: {this.state.product.variants}</div>
          </div>

<br/>
      <table align="center">

      <tbody>

      <tr style={{display: tableDisplay}}>
      <th>Store #</th><th>Address</th><th>ZIP</th><th className="right">Price</th><th>Qty</th><th>Stock</th><th>Aisle</th><th>Pickup Today</th>
      </tr>
      {
        this.state.storePrices.map(storePrice =>

          <tr key={storePrice.no} className="alternate">
            <td><a target="_blank" rel="noopener noreferrer"
                href={`https://www.walmart.com/store/${storePrice.no}/search?query=${this.state.product.sku}`}>{storePrice.no}</a></td>
            <td>{storePrice.address}</td>
            <td>{storePrice.zip}</td>
            <td className="right">{formatCurrency(storePrice.price)}</td>
            <td className="right">{storePrice.qty}</td>
            <td>{storePrice.stock}</td>
            <td>{storePrice.location}</td>
            <td>{storePrice.pickupToday? 'Yes': 'No'}</td>
          </tr>
        )
      }
      </tbody>
      </table>
      <br/>
      <div>
      <h3>Recent searches</h3>
      <form onSubmit={this.handleSearch}>
        <label>Search: </label>
        <input type = "text" name="q" value={this.state.q||''} onChange={this.handleChange}/>
        <input type="submit" value="Search" /> <br/>
        SKU, UPC or Name - item search.  Store# - In stock items in the store from local searches.
      </form>
      <br/>
      <table className="alternate left-text" align="center" width="95%">
        <tbody>
          <tr><th>SKU</th><th>Name</th><th className="right-text">Price</th><th>Address</th></tr>
          {
            this.state.searches.map((s, idx) =>
              <tr key={idx}>
                <td width="10%">
                  <a target="_blank" rel="noopener noreferrer" href={`https://www.brickseek.com/walmart-inventory-checker?sku=${s.sku}`}>{s.sku}</a> &nbsp;
                  <a href='#' onClick={(e) => this.handleSearchAgain(s.sku, e)}>&#x21BB;</a>
                </td>
                <td width="55%">
                  {s.name} &nbsp;
                  <a target="_blank" rel="noopener noreferrer" href={`https://www.walmart.com/store/${s.storeId}/search?query=${s.sku}`}>ST</a> &nbsp;
                  <a target="_blank" rel="noopener noreferrer" href={`https://www.walmart.com/ip/${s.sku}`}>WM</a> &nbsp;
                  <span style={{display:s.upc?'inline-block':'none'}} ><a target="_blank" rel="noopener noreferrer" href={`http://barcode.live?upc=${s.upc}`}>BC</a></span>
                </td>
                <td width="10%" className="right-text">{formatCurrency(s.price)}</td>
                <td width="25%">#{s.storeId}, {s.address} {s.zip}</td>
              </tr>
            )
          }
        </tbody>
      </table>
      <br/>
      </div>
      </div>
      </div>
      </div>
    );
  }
}

export default App;
