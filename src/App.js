import React, {Component} from 'react';
import './App.css';
//import logo from './logo.svg';
const axios = require('axios');
const stores = require('./stores.json');
//===============
const secrets = require('./secrets.json');
const apiKey = secrets.apiKey;
const walmart = require('walmart')(apiKey);

const queryString = require('query-string');

let allStores = stores.allStores;
let failedStores = [];

const randomApiDomain = () => {
  let domains = ['walseek-rest.herokuapp.com', 'walseek-rest-1.herokuapp.com', 'walseek-rest-2.herokuapp.com'];
  return domains[Math.floor(Math.random()*domains.length)];
}
const saveSearch = (product) => {
  let url = 'https://walseek-rest.herokuapp.com/products';
  //let url = 'http://localhost:3001/products';
  axios.post(url, product).catch(e => console.log('save search failed'));
}

const getUPC = async (sku) => {
  const apiKey = secrets.apiKey;
  const url = `https://cors-anywhere.herokuapp.com/https://api.walmartlabs.com/v1/items/${sku}?apiKey=${apiKey}`;
  let resp = await axios.get(url);
  return resp.data.upc;
};

const getPrice = (response => {
  let priceObj = {
    "no": 0,
    "price": 9999,
    "stock": "NA"
  };
  if (response && response.data && response.data.data && response.data.data.inStore) {
    priceObj = {
      "no": response.data.data.inStore.storeId,
      "price": response.data.data.inStore.price.priceInCents / 100,
      "stock": response.data.data.inStore.inventory ? response.data.data.inStore.inventory.status : 'NA'
    };
    //priceObj.stock = response.data.data.inStore.inventory ? response.data.data.inStore.inventory.status : 'NA';
  }
  return priceObj;
});

const productDetails = (result) => {
  return {
    name: result.data.data.common.name,
    sku: result.data.data.common.productId.wwwItemId,
    upc: result.data.data.common.productId.upca,
    url: result.data.data.common.productUrl,
    bsUrl: 'https://www.brickseek.com/walmart-inventory-checker?sku=' + result.data.data.common.productId.wwwItemId,
    available: result.data.data.common.offerType
  };
}

const getStore = storeId => {return allStores.filter(st => st.no === storeId)[0]};

const getStorePricePromise = (upc, storeId) => {

  let url = `https://search.mobile.walmart.com/v1/products-by-code/UPC/${upc}`;
  return axios.get(url, {
    params: {
      storeId: storeId
    }
  }).catch(e => {
    failedStores.push(storeId);
    return e;
  })
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
      searches: []
    }

    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.searchStores = this.searchStores.bind(this);
    this.searchHistory = this.searchHistory.bind(this);
  }

  searchHistory = async () => {
    let url = 'https://walseek-rest.herokuapp.com/products?count=50';
    //let url = 'http://localhost:3001/products';
    let searches = [];
    axios.get(url).then(response => {
      if (response && response.data) {
        searches = response.data;
      }
      searches.map(s => {delete s.createdDate; delete s._id; delete s.__v});
      this.setState({searches});
    })
    .catch(e => {
      console.log('Cannot get recent searches');
    });
  }

  searchStores = async (upc, zip) => {
    let [numStores, storeCount, lowPrice, lowZip] = [100, 4683, 9999, 0];
    //storeCount = allStores.length;
    if (zip && zip.length === 5) {
      allStores = await walmart.stores.byZip(zip);
    };

    if (upc.length < 12) {
      upc = await getUPC(upc);
    }

    if (!upc) {
      console.log('UPC not found');
      return;
    }
    let progress = 0;

    for (let i = 0; i< storeCount; i = i + numStores) {
      let domain = randomApiDomain();
      let url = `https://${domain}/stores-by-code/${upc}`;
      //let url = `http://localhost:3001/stores-by-code/${upc}`;
      axios.get(url, {
        params: {
          start: i,
          stores: numStores
        }
      })
      .then(resp => {
        if (resp.data.item && resp.data.item.sku && !this.state.product.sku) {
          this.setState({product: resp.data.item});
        }

        let storePrices = this.state.storePrices;
        resp.data.storePrices.map(s => {
          if (s.price <= lowPrice){
          storePrices.unshift(s);
          [lowPrice, lowZip] = [s.price, s.zip];
        }
        });

        this.setState({storePrices: storePrices.slice(0,25)});
        progress = Math.min(100, this.state.progress + numStores * 100 /storeCount);
        this.setState({progress});
        if (progress === 100) {
          let product = (({ name, sku}) => ({name, sku}))(this.state.product);
          product = {...product, price:lowPrice, zip: '00000'.concat(lowZip).slice(-5)};
          saveSearch(product);
        }
      })
      .catch (e => {
        progress = Math.min(100, this.state.progress + numStores * 100 /storeCount);
        this.setState({progress});

        console.log('errored', progress, e);
      })
    }

  }

  handleChange(event) {
    this.setState({[event.target.name]: event.target.value});
  }

  handleSubmit(event) {
    this.setState({progress: 1, product: {}})
    if (this.state.upc.length > 3) {
      this.setState({storePrices: []});
      this.searchStores(this.state.upc, this.state.zip);
    }
    if (event) {
      event.preventDefault();
    }
  }

  componentDidMount() {
    //eslint-disable-next-line
    let upc = queryString.parseUrl(location.href).query.item;

    if (upc) {
      this.setState({upc: upc.slice(-12)});
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
      Enter SKU or UPC. Search may take 1-3 minutes.
      *One search at a time. No multi-tab search please!*
      </div><br/>
      <form onSubmit={this.handleSubmit}>
        <label>
        SKU or UPC: <input type = "text" name="upc" value={this.state.upc} onChange={this.handleChange}/>
        </label>
        <label style={{display:"none"}}>
        ZIP: <input type = "text" name="zip" value={this.state.zip} onChange={this.handleChange}/>
        </label>
        <input disabled={this.state.progress > 0 && this.state.progress < 100} type="submit" value="Submit" />
      </form>

      <div id="progressbar">
      <div id="progress" style={{width:`${this.state.progress}%`}}>{this.state.progress >= 100 ? 'Done!': ''}</div>
      </div>
      <br/>


          <div style={{display:productDisplay}}>
          <div>Walmart: <a target="_blank" href={this.state.product.url}>{this.state.product.name}</a></div>
          <div>Brickseek: <a target="_blank" href={this.state.product.bsUrl}>{this.state.product.sku}</a></div>
          <div>UPC Barcode:<a target="_blank" href={`http://barcode.live/?upc=${this.state.product.upc}`}> {this.state.product.upc}</a></div>
          <div>Sold: {this.state.product.offerType}</div>
          </div>

<br/>
      <table align="center">

      <tbody>

      <tr style={{display: tableDisplay}}>
      <th>Store #</th><th>Address</th><th>ZIP</th><th>Price</th><th>Stock</th>
      </tr>
      {
        this.state.storePrices.map(storePrice =>

          <tr key={storePrice.no}>
            <td><a target="_blank" href={`https://www.walmart.com/store/${storePrice.no}/search?query=${this.state.product.sku}`}>{storePrice.no}</a></td>
            <td>{storePrice.address}</td>
            <td>{storePrice.zip}</td>
            <td>{storePrice.price}</td>
            <td>{storePrice.stock}</td>
          </tr>
        )
      }
      </tbody>
      </table>
      <br/>
      <div>
      Recent searches: <br/>
      <table align="center">
        <tbody>
          <tr><th>Name</th><th>SKU</th><th>Price</th><th>ZIP</th></tr>

        {
          this.state.searches.map((s,idx) =>
            <tr key={idx}>
              <td>{s.name}</td>
              <td>{s.sku}</td>
              <td>{s.price}</td>
              <td>{s.zip}</td>
            </tr>
          )
        }
        </tbody>
      </table>
      </div>
      </div>

      </div>
      </div>
    );
  }
}

export default App;
