import React, { Component, useState, useRef, useEffect } from "react";
import "./App.css";

class Border extends Component {
    render() {
      return <div className="Border">{this.props.children}</div>;
    }
  }
  
  function enlargeArtworkUrl(url, size) {
    return url.replace(/\/100x100/, "/" + size + "x" + size);
  }
  
  function albumConstructor(album, colorRef) {
    return (
      <Album
        // key={album.collectionId}
        coverArt={enlargeArtworkUrl(album.CoverURL, 350)}
        title={album.Title}
        // year={album.releaseDate.slice(0,4)}
        artist={album.Artist}
        // trackCount={album.trackCount}
        // collectionPrice={album.collectionPrice}
        // collectionViewUrl={album.collectionViewUrl}
        albumURL={album.AlbumURL}
        albumId={album.URI}
        ordering={album.Order}
        palette={colorRef}
      />
    );
  }
  
  function Album(props) {
    const imgRef = React.createRef();
    const borderRef = useRef(null);
    const numberRef = useRef(null)
    const [color, setColor] = useState("");
  
    useEffect(() => {
      setColor(props.palette.current);
    }, [props.palette.current]);
  
    return (
      <div style={{ display: "inline-block"}}>
        <div ref={numberRef} className="Number">
          {props.ordering !== 0 ? props.ordering : <></>}
        </div>
        <div className="Title">{props.title}</div>
        <div ref={borderRef} className="Border">
          {color ? (
            <a href={props.albumURL} target="_blank" rel="noopener noreferrer">
              <img
                src={props.coverArt}
                ref={imgRef}
                className="CoverArt"
                alt={"Cover of " + props.title}
                onLoad={() => {
                  borderRef.current.style.backgroundColor = color;
                  numberRef.current.style.color = color;
                }}
              />
            </a>
          ) : (
            <></>
          )}
        </div>
        <div className="Artist"> {props.artist}</div>
      </div>
    );
  }

export { enlargeArtworkUrl, albumConstructor }